const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 113 (migration 095): a group / page with more than
// POST_FANOUT_INLINE_MAX members / followers hears about a new post after
// the post request -- queued, then sent in chunks, each recipient once.
describe('new-post notifications for big groups and pages (queued)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  // "Big" here means more than 2.
  beforeAll(() => { process.env.POST_FANOUT_INLINE_MAX = '2'; });
  afterAll(() => { delete process.env.POST_FANOUT_INLINE_MAX; });
  // Loaded after setupTestApp has pointed the database at the test one.
  const fanout = require('../../services/postFanoutService');

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const postIn = async (user, group, content = 'hello group') =>
    (await request(app).post('/posts').set(auth(user)).field('content', content).field('communityId', String(group.id))).body;
  const told = async (postId) => (await pool.query(
    "SELECT user_id FROM notifications WHERE post_id = $1 AND type IN ('group_post', 'page_post') ORDER BY user_id", [postId])).rows.map((r) => r.user_id);
  const waiting = async () => (await pool.query('SELECT post_id, after_user_id FROM post_fanout_queue')).rows;

  // An admin (the creator) and `n` members, all on "All" for this group.
  async function groupOf(n) {
    const admin = await registerAndLogin(app);
    const group = (await request(app).post('/communities').set(auth(admin)).send({ name: 'Big group' })).body;
    const members = [];
    for (let i = 0; i < n; i += 1) {
      const m = await registerAndLogin(app);
      await request(app).post(`/communities/${group.id}/join`).set(auth(m));
      await request(app).put(`/communities/${group.id}/notifications`).set(auth(m)).send({ level: 'all' });
      members.push(m);
    }
    return { admin, group, members };
  }

  it('a small group is told at once, inside the post request', async () => {
    const { admin, group, members } = await groupOf(1); // 2 with the admin: not big
    const post = await postIn(admin, group);
    expect(await told(post.id)).toEqual([members[0].id]);
    expect(await waiting()).toEqual([]);
  });

  it('a big group: the post returns at once, then the queue tells every member once (never the author)', async () => {
    const { admin, group, members } = await groupOf(4);
    const post = await postIn(admin, group);
    expect(post.id).toBeDefined();
    expect(await told(post.id)).toEqual([]); // not inside the request
    expect(await waiting()).toEqual([{ post_id: post.id, after_user_id: 0 }]);
    expect(await fanout.drain()).toEqual({ notified: 4, chunks: 1 });
    expect(await told(post.id)).toEqual(members.map((m) => m.id).sort((a, b) => a - b));
    expect(await waiting()).toEqual([]);
    expect(await fanout.drain()).toEqual({ notified: 0, chunks: 0 }); // nothing twice
  });

  it('in chunks: the cursor moves with each chunk, and a later pass carries on where one stopped', async () => {
    const { admin, group, members } = await groupOf(5);
    const post = await postIn(admin, group);
    const ids = members.map((m) => m.id).sort((a, b) => a - b);
    expect(await fanout.drain({ chunk: 2, maxChunks: 1 })).toEqual({ notified: 2, chunks: 1 });
    expect(await told(post.id)).toEqual(ids.slice(0, 2));
    expect(await waiting()).toEqual([{ post_id: post.id, after_user_id: ids[1] }]);
    expect(await fanout.drain({ chunk: 2 })).toEqual({ notified: 3, chunks: 2 });
    expect(await told(post.id)).toEqual(ids);
    expect(await waiting()).toEqual([]);
  });

  it('two instances draining at once still tell each member exactly once', async () => {
    const { admin, group } = await groupOf(6);
    const post = await postIn(admin, group);
    await Promise.all([fanout.drain({ chunk: 2 }), fanout.drain({ chunk: 2 }), fanout.drain({ chunk: 2 })]);
    const rows = await told(post.id);
    expect(rows.length).toBe(6);
    expect(new Set(rows).size).toBe(6);
  });

  it('the same rules as before: a member\'s Off, a block, a muted author', async () => {
    const { admin, group, members } = await groupOf(4);
    const [off, blocker, muter, glad] = members;
    await request(app).put(`/communities/${group.id}/notifications`).set(auth(off)).send({ level: 'off' });
    await request(app).post(`/users/${admin.id}/block`).set(auth(blocker));
    await request(app).post(`/users/${admin.id}/mute`).set(auth(muter));
    const post = await postIn(admin, group);
    await fanout.drain();
    expect(await told(post.id)).toEqual([glad.id]);
  });

  it('a post deleted while it waits takes its job with it', async () => {
    const { admin, group } = await groupOf(4);
    const post = await postIn(admin, group);
    expect((await request(app).delete(`/posts/${post.id}`).set(auth(admin))).status).toBe(200);
    expect(await waiting()).toEqual([]);
    expect(await fanout.drain()).toEqual({ notified: 0, chunks: 0 });
  });

  it('a big page: its followers, never its admins', async () => {
    const owner = await registerAndLogin(app);
    const coAdmin = await registerAndLogin(app);
    const page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Big page' })).body;
    expect((await request(app).post(`/pages/${page.id}/admins`).set(auth(owner)).send({ username: coAdmin.username })).status).toBeLessThan(300);
    const fans = [];
    for (let i = 0; i < 3; i += 1) {
      const f = await registerAndLogin(app);
      await request(app).post(`/pages/${page.id}/follow`).set(auth(f));
      fans.push(f);
    }
    await request(app).post(`/pages/${page.id}/follow`).set(auth(coAdmin));
    const post = (await request(app).post('/posts').set(auth(owner)).field('content', 'news').field('pageId', String(page.id))).body;
    expect(await told(post.id)).toEqual([]);
    await fanout.drain();
    expect(await told(post.id)).toEqual(fans.map((f) => f.id).sort((a, b) => a - b));
  });

  it('the daily cleanup sends what is left (the backstop)', async () => {
    const { admin, group } = await groupOf(3);
    const post = await postIn(admin, group);
    const cleanup = require('../../services/cleanupService');
    expect((await cleanup.run({ dryRun: true })).newPostNotificationsWaiting).toBe(1);
    expect((await cleanup.run()).newPostNotificationsSent).toBe(3);
    expect((await told(post.id)).length).toBe(3);
  });
});
