const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 101: notifications about new posts in your groups and on the pages
// you follow, with All / Highlights / Off per group or page (migration 083).
describe('new-post notifications for groups and pages (Day 101)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const createGroup = async (user, privacy = 'public') => (await request(app).post('/communities').set(auth(user)).send({ name: 'Tea Lovers', privacy })).body;
  const join = (user, group) => request(app).post(`/communities/${group.id}/join`).set(auth(user));
  const postIn = async (user, group, content = 'hello group') =>
    (await request(app).post('/posts').set(auth(user)).field('content', content).field('communityId', String(group.id))).body;
  const createPage = async (user) => (await request(app).post('/pages').set(auth(user)).send({ name: 'Mingalar Cafe' })).body;
  const followPage = (user, page) => request(app).post(`/pages/${page.id}/follow`).set(auth(user));
  const postAs = async (user, page, content = 'new menu') =>
    (await request(app).post('/posts').set(auth(user)).field('content', content).field('pageId', String(page.id))).body;
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));
  const setGroupLevel = (user, group, level) => request(app).put(`/communities/${group.id}/notifications`).set(auth(user)).send({ level });
  const setPageLevel = (user, page, level) => request(app).put(`/pages/${page.id}/notifications`).set(auth(user)).send({ level });
  const list = async (user) => (await request(app).get('/notifications').set(auth(user))).body.notifications;
  const newPosts = async (user) => (await list(user)).filter((n) => n.type === 'group_post' || n.type === 'page_post');
  // The rows themselves (the list hides some anyway; a row also means a push).
  const rowsFor = async (user) => (await pool.query("SELECT type FROM notifications WHERE user_id = $1 AND type IN ('group_post', 'page_post')", [user.id])).rows;
  const unread = async (user) => (await request(app).get('/notifications/unread-count').set(auth(user))).body.unreadCount;

  // An admin (the creator), an ordinary member and a reader in one group.
  async function groupOfThree(privacy = 'public') {
    const admin = await registerAndLogin(app);
    const member = await registerAndLogin(app);
    const reader = await registerAndLogin(app);
    const group = await createGroup(admin, privacy);
    for (const u of [member, reader]) await join(u, group);
    if (privacy === 'private') {
      for (const u of [member, reader]) await request(app).post(`/communities/${group.id}/requests/${u.id}/approve`).set(auth(admin));
    }
    return { admin, member, reader, group };
  }

  it('highlights by default: the admins\' posts reach everyone, with the group and the post', async () => {
    const { admin, member, reader, group } = await groupOfThree();
    expect((await request(app).get(`/communities/${group.id}`).set(auth(reader))).body.my_post_notifications).toBe('highlights');
    const post = await postIn(admin, group, 'Meeting on Friday');
    for (const u of [member, reader]) {
      expect(await newPosts(u)).toEqual([
        expect.objectContaining({ type: 'group_post', post_id: post.id, community_id: group.id, community_name: 'Tea Lovers', actor_id: admin.id, post_content: 'Meeting on Friday' })
      ]);
    }
    // Never to the author.
    expect(await newPosts(admin)).toEqual([]);
  });

  it("highlights: a member's post reaches only the people who follow them; all: every post", async () => {
    const { member, reader, admin, group } = await groupOfThree();
    await postIn(member, group, 'first');
    expect(await newPosts(reader)).toEqual([]);
    expect(await newPosts(admin)).toEqual([]);
    await follow(reader, member);
    await postIn(member, group, 'second');
    expect((await newPosts(reader)).map((n) => n.post_content)).toEqual(['second']);
    expect((await setGroupLevel(admin, group, 'all')).body).toEqual({ level: 'all' });
    await postIn(member, group, 'third');
    expect((await newPosts(admin)).map((n) => n.post_content)).toEqual(['third']);
  });

  it('off: nothing from that group, other groups unchanged; the Groups setting turns all of it off', async () => {
    const { admin, reader, group } = await groupOfThree();
    const other = await createGroup(admin);
    await join(reader, other);
    await setGroupLevel(reader, group, 'off');
    expect((await request(app).get(`/communities/${group.id}`).set(auth(reader))).body.my_post_notifications).toBe('off');
    await postIn(admin, group, 'quiet');
    await postIn(admin, other, 'loud');
    expect((await newPosts(reader)).map((n) => n.post_content)).toEqual(['loud']);

    await request(app).put('/notification-preferences').set(auth(reader)).send({ groups: false });
    await postIn(admin, other, 'also quiet');
    expect((await newPosts(reader)).map((n) => n.post_content)).toEqual(['loud']);
  });

  it('not across a block, not from someone muted or restricted, not to a pending member', async () => {
    const { admin, member, reader, group } = await groupOfThree('private');
    const pending = await registerAndLogin(app);
    await join(pending, group);
    await request(app).post(`/users/${admin.id}/block`).set(auth(member));
    await request(app).post(`/users/${admin.id}/mute`).set(auth(reader));
    await postIn(admin, group);
    expect(await rowsFor(member)).toEqual([]);
    expect(await rowsFor(reader)).toEqual([]);
    expect(await rowsFor(pending)).toEqual([]);
    // Asked to join but not let in: no choice to show yet.
    expect((await request(app).get(`/communities/${group.id}`).set(auth(pending))).body).toMatchObject({ my_status: 'pending', my_post_notifications: null });

    const third = await registerAndLogin(app);
    await join(third, group);
    await request(app).post(`/communities/${group.id}/requests/${third.id}/approve`).set(auth(admin));
    await request(app).post(`/users/${admin.id}/restrict`).set(auth(third));
    await postIn(admin, group);
    expect(await rowsFor(third)).toEqual([]);
  });

  it("leaving a private group hides its post notifications (list and badge); joining again brings them back", async () => {
    const { admin, reader, group } = await groupOfThree('private');
    await postIn(admin, group, 'members only');
    expect(await newPosts(reader)).toHaveLength(1);
    // (plus "You're now a member" from being let in)
    const before = await unread(reader);
    await request(app).delete(`/communities/${group.id}/members/${reader.id}`).set(auth(reader));
    expect(await newPosts(reader)).toEqual([]);
    expect(await unread(reader)).toBe(before - 1);
    await join(reader, group);
    await request(app).post(`/communities/${group.id}/requests/${reader.id}/approve`).set(auth(admin));
    expect(await newPosts(reader)).toHaveLength(1);
  });

  it('a deleted post takes its notifications with it', async () => {
    const { admin, reader, group } = await groupOfThree();
    const post = await postIn(admin, group);
    await request(app).delete(`/posts/${post.id}`).set(auth(admin));
    expect(await newPosts(reader)).toEqual([]);
  });

  it('a scheduled group post notifies when it goes up, not before', async () => {
    const { admin, reader, group } = await groupOfThree();
    const at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const draft = (await request(app).post('/drafts').set(auth(admin)).field('content', 'later').field('communityId', String(group.id))).body;
    expect((await request(app).put(`/drafts/${draft.id}/schedule`).set(auth(admin)).send({ scheduledFor: at })).status).toBe(200);
    expect(await newPosts(reader)).toEqual([]);
    await pool.query("UPDATE post_drafts SET scheduled_for = now() - interval '1 minute' WHERE id = $1", [draft.id]);
    await require('../../services/scheduledPostService').publishDue();
    expect((await newPosts(reader)).map((n) => n.post_content)).toEqual(['later']);
  });

  it('pages: highlights is the first new post of the day; all is every post; off is none', async () => {
    const owner = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const keen = await registerAndLogin(app);
    const page = await createPage(owner);
    for (const u of [fan, keen]) await followPage(u, page);
    expect((await request(app).get(`/pages/${page.id}`).set(auth(fan))).body.my_post_notifications).toBe('highlights');
    await setPageLevel(keen, page, 'all');
    await postAs(owner, page, 'one');
    await postAs(owner, page, 'two');
    expect((await newPosts(fan)).map((n) => [n.type, n.page_name, n.post_content])).toEqual([['page_post', 'Mingalar Cafe', 'one']]);
    expect((await newPosts(keen)).map((n) => n.post_content)).toEqual(['two', 'one']);
    // A day later, highlights lets the next one through.
    await pool.query("UPDATE notifications SET created_at = now() - interval '25 hours' WHERE user_id = $1", [fan.id]);
    await postAs(owner, page, 'three');
    expect((await newPosts(fan)).map((n) => n.post_content)).toEqual(['three', 'one']);
    await setPageLevel(fan, page, 'off');
    await pool.query("UPDATE notifications SET created_at = now() - interval '25 hours' WHERE user_id = $1", [fan.id]);
    await postAs(owner, page, 'four');
    expect((await newPosts(fan)).map((n) => n.post_content)).toEqual(['three', 'one']);
  });

  it("a page's post never notifies its own admins; the Pages setting turns it off", async () => {
    const owner = await registerAndLogin(app);
    const helper = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const page = await createPage(owner);
    await followPage(helper, page);
    await followPage(fan, page);
    await request(app).post(`/pages/${page.id}/admins`).set(auth(owner)).send({ username: helper.username });
    await postAs(helper, page);
    expect(await newPosts(helper)).toEqual([]);
    expect(await newPosts(fan)).toHaveLength(1);
    await request(app).put('/notification-preferences').set(auth(fan)).send({ pages: false });
    await setPageLevel(fan, page, 'all');
    await postAs(owner, page);
    expect(await newPosts(fan)).toHaveLength(1);
  });

  it('the choice: members / followers only, a known level, your own row only', async () => {
    const { admin, reader, group } = await groupOfThree();
    const outsider = await registerAndLogin(app);
    expect((await setGroupLevel(outsider, group, 'all')).status).toBe(403);
    expect((await setGroupLevel(reader, group, 'loud')).status).toBe(400);
    expect((await setGroupLevel(reader, group, ['all'])).status).toBe(400);
    expect((await request(app).put('/communities/999999/notifications').set(auth(reader)).send({ level: 'all' })).status).toBe(404);
    expect((await request(app).put(`/communities/${group.id}/notifications`).send({ level: 'all' })).status).toBe(401);
    await setGroupLevel(reader, group, 'off');
    expect((await request(app).get(`/communities/${group.id}`).set(auth(admin))).body.my_post_notifications).toBe('highlights');
    expect((await request(app).get(`/communities/${group.id}`).set(auth(outsider))).body.my_post_notifications).toBeNull();

    const page = await createPage(admin);
    expect((await setPageLevel(outsider, page, 'all')).status).toBe(403);
    await followPage(outsider, page);
    expect((await setPageLevel(outsider, page, 'nope')).status).toBe(400);
    expect((await setPageLevel(outsider, page, 'off')).body).toEqual({ level: 'off' });
    // Your data export has the choices.
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(outsider))).text);
    expect(JSON.stringify(data)).toContain('"post_notifications":"off"');
    // Unfollowing drops the choice; following again starts at highlights.
    await request(app).delete(`/pages/${page.id}/follow`).set(auth(outsider));
    await followPage(outsider, page);
    expect((await request(app).get(`/pages/${page.id}`).set(auth(outsider))).body.my_post_notifications).toBe('highlights');
  });
});
