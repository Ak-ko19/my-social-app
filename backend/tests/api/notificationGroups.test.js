const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 81: the notifications center -- grouped rows ("Alice, Bob and 3 others
// liked your post"), filters, paging by cursor, a group read at once, and
// the live count.
describe('notification groups (Day 81)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  afterEach(() => jest.restoreAllMocks());

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const list = async (user, query = '') => (await request(app).get(`/notifications${query}`).set(auth(user))).body;
  const newPost = async (user, content = 'a post') => (await request(app).post('/posts').set(auth(user)).field('content', content)).body;
  const like = (user, post) => request(app).post(`/posts/${post.id}/like`).set(auth(user));
  const people = (n) => Promise.all(Array.from({ length: n }, () => registerAndLogin(app)));

  it('likes on one post are one row: count, people, the newest three of them', async () => {
    const me = await registerAndLogin(app);
    const post = await newPost(me);
    const fans = await people(4);
    for (const fan of fans) await like(fan, post);
    const { notifications } = await list(me);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: 'like', post_id: post.id, count: 4, actor_count: 4, is_read: false, actor_id: fans[3].id });
    expect(notifications[0].actors.map((a) => a.id)).toEqual([fans[3].id, fans[2].id, fans[1].id]);
  });

  it('different posts, comment likes and mentions stay apart', async () => {
    const me = await registerAndLogin(app);
    const [a, b] = await people(2);
    const one = await newPost(me, 'one');
    const two = await newPost(me, 'two');
    await like(a, one);
    await like(a, two);
    const myComment = (await request(app).post(`/posts/${one.id}/comments`).set(auth(me)).send({ content: 'mine' })).body;
    await request(app).post(`/comments/${myComment.id}/like`).set(auth(a));
    await request(app).post(`/comments/${myComment.id}/like`).set(auth(b));
    await newPost(a, `hi @${me.username}`);
    await newPost(b, `hello @${me.username}`);
    const rows = (await list(me)).notifications.map((n) => `${n.type}:${n.count}`);
    expect(rows).toEqual(['mention:1', 'mention:1', 'comment_like:2', 'like:1', 'like:1']);
  });

  it('new followers group per day', async () => {
    const me = await registerAndLogin(app);
    const [a, b, c] = await people(3);
    for (const fan of [a, b]) await request(app).post(`/users/${me.id}/follow`).set(auth(fan));
    await pool.query("UPDATE notifications SET created_at = now() - interval '2 days' WHERE user_id = $1", [me.id]);
    await request(app).post(`/users/${me.id}/follow`).set(auth(c));
    const rows = (await list(me)).notifications;
    expect(rows.map((n) => [n.type, n.count])).toEqual([['follow', 1], ['follow', 2]]);
  });

  it('a group is read only when all of it is; one tap reads it all', async () => {
    const me = await registerAndLogin(app);
    const post = await newPost(me);
    const [a, b, c] = await people(3);
    await like(a, post);
    await like(b, post);
    const [row] = (await list(me)).notifications;
    const read = await request(app).put(`/notifications/${row.id}/read`).set(auth(me));
    expect(read.body).toEqual({ id: row.id, is_read: true, marked: 2 });
    expect((await list(me)).notifications[0].is_read).toBe(true);
    // Someone new: the group is unread again, with three people now.
    await like(c, post);
    expect((await list(me)).notifications[0]).toMatchObject({ is_read: false, count: 3 });
    // Marking by an older id of the group reads the new one too.
    expect((await request(app).put(`/notifications/${row.id}/read`).set(auth(me))).body.marked).toBe(1);
    expect((await request(app).get('/notifications/unread-count').set(auth(me))).body.unreadCount).toBe(0);
    // Not someone else's.
    expect((await request(app).put(`/notifications/${row.id}/read`).set(auth(a))).status).toBe(404);
  });

  it('filters: unread, mentions, follows', async () => {
    const me = await registerAndLogin(app);
    const [a, b] = await people(2);
    const post = await newPost(me);
    await like(a, post);
    await request(app).post(`/users/${me.id}/follow`).set(auth(b));
    await newPost(a, `hi @${me.username}`);
    const types = async (filter) => (await list(me, `?filter=${filter}`)).notifications.map((n) => n.type);
    expect(await types('all')).toEqual(['mention', 'follow', 'like']);
    expect(await types('mentions')).toEqual(['mention']);
    expect(await types('follows')).toEqual(['follow']);
    const [likeRow] = (await list(me, '?filter=all')).notifications.filter((n) => n.type === 'like');
    await request(app).put(`/notifications/${likeRow.id}/read`).set(auth(me));
    expect(await types('unread')).toEqual(['mention', 'follow']);
    expect((await request(app).get('/notifications?filter=everything').set(auth(me))).status).toBe(400);
  });

  it('pages by cursor: 20, then the rest, nothing twice, nothing skipped', async () => {
    const me = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    for (let i = 0; i < 25; i++) await newPost(fan, `post ${i} @${me.username}`);
    const first = await list(me);
    expect(first.notifications).toHaveLength(20);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await list(me, `?cursor=${encodeURIComponent(first.nextCursor)}`);
    expect(second.notifications).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.notifications, ...second.notifications].map((n) => n.id);
    expect(new Set(ids).size).toBe(25);
    expect(ids).toEqual([...ids].sort((x, y) => y - x));
    expect((await request(app).get('/notifications?cursor=nonsense').set(auth(me))).status).toBe(400);
    expect((await list(me, '?limit=5')).notifications).toHaveLength(5);
  });

  it('covers the newest 1,000 notifications', async () => {
    const me = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await pool.query(
      `INSERT INTO notifications (user_id, actor_id, type, created_at)
       SELECT $1, $2, 'mention', now() - g * interval '1 second' FROM generate_series(1, 1005) g`,
      [me.id, fan.id]
    );
    let seen = 0;
    let cursor = null;
    do {
      const page = await list(me, `?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      seen += page.notifications.length;
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toBe(1000);
  });

  it('tells the open apps at once: new notification, and reads', async () => {
    const emitted = [];
    const sockets = require('../../sockets');
    jest.spyOn(sockets, 'getIO').mockReturnValue({ to: (room) => ({ emit: (event, payload) => emitted.push([room, event, payload]) }) });
    const me = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const post = await newPost(me);
    await like(fan, post);
    await new Promise((r) => setTimeout(r, 50)); // not awaited by the request
    expect(emitted).toContainEqual([`user_${me.id}`, 'notification_new', { unreadCount: 1 }]);
    await request(app).put('/notifications/read-all').set(auth(me));
    await new Promise((r) => setTimeout(r, 50));
    expect(emitted).toContainEqual([`user_${me.id}`, 'notifications_read', { unreadCount: 0 }]);
    // Nothing goes to the person who did it.
    expect(emitted.some(([room]) => room === `user_${fan.id}`)).toBe(false);
  });
});
