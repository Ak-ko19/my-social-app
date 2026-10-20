const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 47 step 2: restricting a person (migration 056) -- Instagram's
// Restrict. Their new comments on your posts wait for your approval (seen
// only by them and you), and they can't notify you. They are never told.
describe('restrict a person (Day 47)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = async (user, content = 'my post') => (await request(app).post('/posts').set(auth(user)).field('content', content)).body;
  const comment = (user, p, content, extra = {}) => request(app).post(`/posts/${p.id}/comments`).set(auth(user)).send({ content, ...extra });
  const comments = async (user, p) => (await request(app).get(`/posts/${p.id}/comments`).set(user ? auth(user) : {})).body.comments;
  const restrict = (a, b) => request(app).post(`/users/${b.id}/restrict`).set(auth(a));
  const notes = async (user) => (await request(app).get('/notifications').set(auth(user))).body.notifications;

  it("their new comment on your post: only they and you see it, and it doesn't notify you", async () => {
    const me = await registerAndLogin(app);
    const troll = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const p = await post(me);
    expect((await restrict(me, troll)).status).toBe(201);

    const res = await comment(troll, p, 'you are wrong');
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('awaiting_approval'); // looks like any comment to them
    expect((await comments(troll, p)).map((c) => [c.content, c.awaiting_approval])).toEqual([['you are wrong', false]]);
    expect((await comments(me, p)).map((c) => [c.content, c.awaiting_approval])).toEqual([['you are wrong', true]]);
    expect(await comments(friend, p)).toEqual([]);
    expect(await comments(null, p)).toEqual([]);
    expect(await notes(me)).toEqual([]);
    // The count gives nothing away: they and you count it, others don't.
    const count = async (u) => (await request(app).get(`/posts/${p.id}`).set(auth(u))).body.comment_count;
    expect([await count(troll), await count(me), await count(friend)]).toEqual([1, 1, 0]);
  });

  it('you approve it (everyone sees it) or delete it; nobody else can approve', async () => {
    const me = await registerAndLogin(app);
    const troll = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const p = await post(me);
    await restrict(me, troll);
    const keep = (await comment(troll, p, 'fair point')).body;
    const drop = (await comment(troll, p, 'rude')).body;
    expect((await request(app).post(`/comments/${keep.id}/approve`).set(auth(troll))).status).toBe(404);
    expect((await request(app).post(`/comments/${keep.id}/approve`).set(auth(friend))).status).toBe(404);
    expect((await request(app).post(`/comments/${keep.id}/approve`).set(auth(me))).body).toEqual({ id: keep.id, awaiting_approval: false });
    expect((await request(app).delete(`/comments/${drop.id}`).set(auth(me))).status).toBe(200);
    expect((await comments(friend, p)).map((c) => c.content)).toEqual(['fair point']);
    expect((await comments(me, p)).map((c) => c.awaiting_approval)).toEqual([false]);
  });

  it('the post owner may delete any comment on their post; others still may not', async () => {
    const me = await registerAndLogin(app);
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const p = await post(me);
    const c = (await comment(a, p, 'hello')).body;
    expect((await request(app).delete(`/comments/${c.id}`).set(auth(b))).status).toBe(403);
    expect((await request(app).delete(`/comments/${c.id}`).set(auth(me))).status).toBe(200);
  });

  it('a held comment notifies nobody it replies to or mentions, and others cannot like it', async () => {
    const me = await registerAndLogin(app);
    const troll = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const p = await post(me);
    const friendComment = (await comment(friend, p, 'nice')).body;
    await restrict(me, troll);
    const held = (await comment(troll, p, `@${friend.username} no`, { parentCommentId: friendComment.id })).body;
    expect((await notes(friend)).map((n) => n.type)).toEqual([]);
    expect((await request(app).post(`/comments/${held.id}/like`).set(auth(friend))).status).toBe(404);
    expect((await request(app).post(`/comments/${held.id}/like`).set(auth(me))).status).toBeLessThan(300);
  });

  it("they can't notify you anywhere -- likes, comments elsewhere, mentions, follows", async () => {
    const me = await registerAndLogin(app);
    const troll = await registerAndLogin(app);
    const p = await post(me);
    await restrict(me, troll);
    await request(app).post(`/posts/${p.id}/like`).set(auth(troll));
    await post(troll, `hey @${me.username}`);
    await request(app).post(`/users/${me.id}/follow`).set(auth(troll));
    expect(await notes(me)).toEqual([]);
    // Unrestricted: back to normal.
    await request(app).delete(`/users/${troll.id}/restrict`).set(auth(me));
    await comment(troll, p, 'ok now');
    expect((await notes(me)).map((n) => n.type)).toEqual(['comment']);
    expect((await comments(await registerAndLogin(app), p)).map((c) => c.content)).toEqual(['ok now']);
  });

  it('only YOUR posts: their comments elsewhere are normal', async () => {
    const me = await registerAndLogin(app);
    const troll = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    await restrict(me, troll);
    const p = await post(other);
    await comment(troll, p, 'normal comment');
    expect((await comments(me, p)).map((c) => [c.content, c.awaiting_approval])).toEqual([['normal comment', false]]);
  });

  it('profile flag, list, idempotent, yourself, export; they see nothing', async () => {
    const me = await registerAndLogin(app);
    const troll = await registerAndLogin(app);
    expect((await restrict(me, troll)).status).toBe(201);
    expect((await restrict(me, troll)).status).toBe(201);
    expect((await request(app).get(`/profile/${troll.id}`).set(auth(me))).body.is_restricted_by_me).toBe(true);
    expect((await request(app).get(`/profile/${me.id}`).set(auth(troll))).body.is_restricted_by_me).toBe(false);
    expect((await request(app).get('/restricted-users').set(auth(me))).body.restrictedUsers.map((u) => u.id)).toEqual([troll.id]);
    const self = await restrict(me, me);
    expect([self.status, self.text]).toEqual([400, "You can't restrict yourself"]);
    expect((await request(app).post('/users/99999/restrict').set(auth(me))).status).toBe(404);
    expect((await request(app).post(`/users/${troll.id}/restrict`)).status).toBe(401);
    expect((await request(app).get('/profile/export').set(auth(me))).body.connections.restricted_users.map((u) => u.username)).toEqual([troll.username]);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1', [troll.id])).rows[0].n).toBe(0);
  });
});
