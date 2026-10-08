const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 47 step 1: muting a person (migration 055) -- their posts and
// stories leave your Home, stories tray and Explore; nothing else changes,
// and they are never told.
describe('mute a person (Day 47)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const post = async (user, content, fields = {}) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return (await req).body;
  };
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));
  const mute = (a, b) => request(app).post(`/users/${b.id}/mute`).set(auth(a));
  const unmute = (a, b) => request(app).delete(`/users/${b.id}/mute`).set(auth(a));
  const feed = async (user) => (await request(app).get('/feed').set(auth(user))).body.posts.map((p) => p.content);

  it('hides their posts from Home -- not yours, not their page, until you unmute', async () => {
    const me = await registerAndLogin(app);
    const noisy = await registerAndLogin(app);
    const quiet = await registerAndLogin(app);
    for (const u of [noisy, quiet]) await follow(me, u);
    const page = (await request(app).post('/pages').set(auth(noisy)).send({ name: 'Noisy Cafe', category: 'business' })).body;
    await request(app).post(`/pages/${page.id}/follow`).set(auth(me));
    await post(noisy, 'noisy 1');
    await post(noisy, 'cafe news', { pageId: String(page.id) });
    await post(quiet, 'quiet 1');
    await post(me, 'mine');

    expect((await mute(me, noisy)).status).toBe(201);
    expect(await feed(me)).toEqual(['mine', 'quiet 1', 'cafe news']);
    expect((await unmute(me, noisy)).status).toBe(200);
    expect(await feed(me)).toEqual(['mine', 'quiet 1', 'cafe news', 'noisy 1']);
  });

  it('hides their stories from the tray; one opened directly still works', async () => {
    const me = await registerAndLogin(app);
    const noisy = await registerAndLogin(app);
    await follow(me, noisy);
    const story = (await request(app).post('/stories').set(auth(noisy)).attach('image', png, { filename: 's.png', contentType: 'image/png' })).body;
    const tray = async () => (await request(app).get('/stories').set(auth(me))).body.map((g) => g.user_id);
    expect(await tray()).toEqual([noisy.id]);
    await mute(me, noisy);
    expect(await tray()).toEqual([]);
    expect((await request(app).post(`/stories/${story.id}/view`).set(auth(me))).status).toBeLessThan(300);
  });

  it('hides their posts from Explore (for you only)', async () => {
    const me = await registerAndLogin(app);
    const noisy = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const p = await post(noisy, 'popular one');
    await request(app).post(`/posts/${p.id}/like`).set(auth(fan));
    const explore = async (user) => (await request(app).get('/explore/posts').set(user ? auth(user) : {})).body.posts.map((x) => x.id);
    expect(await explore(me)).toEqual([p.id]);
    await mute(me, noisy);
    expect(await explore(me)).toEqual([]);
    expect(await explore(fan)).toEqual([p.id]);
    expect(await explore(null)).toEqual([p.id]);
  });

  it('their profile, posts, search and the post itself stay; they are never told', async () => {
    const me = await registerAndLogin(app);
    const noisy = await registerAndLogin(app);
    const p = await post(noisy, 'still here');
    await mute(me, noisy);
    const profile = (await request(app).get(`/profile/${noisy.id}`).set(auth(me))).body;
    expect(profile).toMatchObject({ id: noisy.id, is_muted_by_me: true });
    expect((await request(app).get(`/users/${noisy.id}/posts`).set(auth(me))).body.posts.map((x) => x.id)).toEqual([p.id]);
    expect((await request(app).get(`/posts/${p.id}`).set(auth(me))).status).toBe(200);
    expect((await request(app).get(`/search/users?q=${noisy.username}`).set(auth(me))).body.map((u) => u.id)).toContain(noisy.id);
    // What they see of me says nothing about it.
    const mine = (await request(app).get(`/profile/${me.id}`).set(auth(noisy))).body;
    expect(mine.is_muted_by_me).toBe(false);
    expect(JSON.stringify(mine)).not.toMatch(/mutes_you|muted_you/);
    expect((await request(app).get('/notifications').set(auth(noisy))).body.notifications).toEqual([]);
  });

  it('is idempotent, refuses yourself and unknown people, needs a login', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    expect((await mute(me, other)).status).toBe(201);
    expect((await mute(me, other)).status).toBe(201);
    expect((await unmute(me, other)).status).toBe(200);
    expect((await unmute(me, other)).status).toBe(200);
    const self = await mute(me, me);
    expect([self.status, self.text]).toEqual([400, "You can't mute yourself"]);
    expect((await request(app).post('/users/99999/mute').set(auth(me))).status).toBe(404);
    expect((await request(app).post('/users/abc/mute').set(auth(me))).status).toBe(400);
    expect((await request(app).post(`/users/${other.id}/mute`)).status).toBe(401);
  });

  it('lists your muted accounts (newest first, paged); the data download has them', async () => {
    const me = await registerAndLogin(app);
    const people = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
    for (const p of people) await mute(me, p);
    const first = (await request(app).get('/muted-users?limit=2').set(auth(me))).body;
    expect([first.mutedUsers.map((u) => u.id), first.hasMore]).toEqual([[people[2].id, people[1].id], true]);
    const second = (await request(app).get('/muted-users?limit=2&page=2').set(auth(me))).body;
    expect([second.mutedUsers.map((u) => u.id), second.hasMore]).toEqual([[people[0].id], false]);
    expect((await request(app).get('/muted-users').set(auth(people[0]))).body.mutedUsers).toEqual([]);
    const data = (await request(app).get('/profile/export').set(auth(me))).body;
    expect(data.connections.muted_users.map((u) => u.username)).toEqual(people.map((p) => p.username));
  });
});
