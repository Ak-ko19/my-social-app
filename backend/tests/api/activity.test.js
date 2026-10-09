const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 48: the activity log -- your likes and comments, newest first, only
// on posts you can still see.
describe('activity log (Day 48)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = async (user, content, fields = {}) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return (await req).body;
  };
  const comment = async (user, p, content) => (await request(app).post(`/posts/${p.id}/comments`).set(auth(user)).send({ content })).body;
  const likes = async (user, q = '') => (await request(app).get(`/activity/likes${q}`).set(auth(user))).body;
  const comments = async (user, q = '') => (await request(app).get(`/activity/comments${q}`).set(auth(user))).body;
  // Spread the timestamps so "newest first" is unambiguous.
  const age = (table, where, seconds) => pool.query(`UPDATE ${table} SET created_at = now() - interval '${seconds} seconds' WHERE ${where}`);

  it('likes: post reactions and comment likes in one list, newest first, with what they were on', async () => {
    const me = await registerAndLogin(app);
    const bob = await registerAndLogin(app);
    const p1 = await post(bob, 'Sunset at the beach');
    const p2 = await post(bob, 'Coffee time');
    const c = await comment(bob, p2, 'with cardamom');
    await request(app).put(`/posts/${p1.id}/reaction`).set(auth(me)).send({ reaction: 'love' });
    await request(app).post(`/comments/${c.id}/like`).set(auth(me));
    await request(app).post(`/posts/${p2.id}/like`).set(auth(me));
    await age('likes', `post_id = ${p1.id}`, 30);
    await age('comment_likes', `comment_id = ${c.id}`, 20);
    await age('likes', `post_id = ${p2.id}`, 10);

    const { items, hasMore } = await likes(me);
    expect(hasMore).toBe(false);
    expect(items.map((i) => [i.kind, i.reaction, i.post_id, i.comment_id])).toEqual([
      ['post', 'like', p2.id, null],
      ['comment', null, p2.id, c.id],
      ['post', 'love', p1.id, null]
    ]);
    expect(items[1]).toMatchObject({ comment_content: 'with cardamom', comment_author: bob.username, post_author: bob.username, post_content: 'Coffee time' });
    // Paged.
    const first = await likes(me, '?limit=2');
    expect([first.items.length, first.hasMore]).toEqual([2, true]);
    expect((await likes(me, '?limit=2&page=2')).items.map((i) => i.post_id)).toEqual([p1.id]);
    // Unliking takes it off.
    await request(app).delete(`/posts/${p2.id}/like`).set(auth(me));
    expect((await likes(me)).items.map((i) => i.kind)).toEqual(['comment', 'post']);
  });

  it("comments: yours, newest first, replies marked; deleting one takes it off; others' never show", async () => {
    const me = await registerAndLogin(app);
    const bob = await registerAndLogin(app);
    const p = await post(bob, 'Question?');
    const top = await comment(me, p, 'Answer');
    await request(app).post(`/posts/${p.id}/comments`).set(auth(me)).send({ content: 'Also this', parentCommentId: top.id });
    await comment(bob, p, 'thanks');
    await age('comments', `id = ${top.id}`, 30);
    const { items } = await comments(me);
    expect(items.map((i) => [i.content, i.is_reply, i.post_id])).toEqual([['Also this', true, p.id], ['Answer', false, p.id]]);
    await request(app).delete(`/comments/${top.id}`).set(auth(me));
    expect((await comments(me)).items).toEqual([]); // the reply went with it
  });

  it('only posts you can still see: blocks, "only me", deactivated authors drop out', async () => {
    const me = await registerAndLogin(app);
    const blocker = await registerAndLogin(app);
    const hider = await registerAndLogin(app);
    const leaver = await registerAndLogin(app);
    const posts = [await post(blocker, 'a'), await post(hider, 'b'), await post(leaver, 'c')];
    for (const p of posts) {
      await request(app).post(`/posts/${p.id}/like`).set(auth(me));
      await comment(me, p, 'hi');
    }
    expect((await likes(me)).items).toHaveLength(3);
    await request(app).post(`/users/${me.id}/block`).set(auth(blocker));
    await pool.query("UPDATE posts SET visibility = 'only_me' WHERE id = $1", [posts[1].id]);
    await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [leaver.id]);
    expect((await likes(me)).items).toEqual([]);
    expect((await comments(me)).items).toEqual([]);
  });

  it("a liked comment you can no longer see (block with its author) drops out", async () => {
    const me = await registerAndLogin(app);
    const host = await registerAndLogin(app);
    const troll = await registerAndLogin(app);
    const p = await post(host, 'party');
    const c = await comment(troll, p, 'lol');
    await request(app).post(`/comments/${c.id}/like`).set(auth(me));
    expect((await likes(me)).items).toHaveLength(1);
    await request(app).post(`/users/${troll.id}/block`).set(auth(me));
    expect((await likes(me)).items).toEqual([]);
  });

  it('is private and needs a login', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const p = await post(other, 'x');
    await request(app).post(`/posts/${p.id}/like`).set(auth(me));
    expect((await likes(other)).items).toEqual([]);
    expect((await request(app).get('/activity/likes')).status).toBe(401);
    expect((await request(app).get('/activity/comments')).status).toBe(401);
  });
});
