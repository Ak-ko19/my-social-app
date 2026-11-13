const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 113 (migration 094): a comment's reactions and replies are stored
// counts kept by triggers; "Most relevant" ranks by them. Each step is
// checked against a real count.
describe('stored comment counts', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  let author;
  let post;
  const comment = (user, content, parentCommentId) =>
    request(app).post(`/posts/${post.id}/comments`).set(auth(user)).send({ content, parentCommentId }).then((r) => r.body);
  const stored = async (id) => {
    const row = (await pool.query('SELECT like_count, reply_count FROM comments WHERE id = $1', [id])).rows[0];
    const real = (await pool.query(
      `SELECT (SELECT count(*)::int FROM comment_likes WHERE comment_id = $1) AS like_count,
              (SELECT count(*)::int FROM comments WHERE parent_comment_id = $1 AND NOT awaiting_approval) AS reply_count`, [id])).rows[0];
    expect(row).toEqual(real);
    return row;
  };

  beforeEach(async () => {
    author = await registerAndLogin(app);
    post = (await request(app).post('/posts').set(auth(author)).field('content', 'discuss')).body;
  });

  it('reactions: like, like again, unlike, and a deleted account', async () => {
    const [a, b] = [await registerAndLogin(app), await registerAndLogin(app)];
    const top = await comment(author, 'top');
    await request(app).post(`/comments/${top.id}/like`).set(auth(a));
    await request(app).post(`/comments/${top.id}/like`).set(auth(a)); // twice: one
    await request(app).post(`/comments/${top.id}/like`).set(auth(b));
    expect(await stored(top.id)).toEqual({ like_count: 2, reply_count: 0 });
    await request(app).delete(`/comments/${top.id}/like`).set(auth(a));
    expect((await stored(top.id)).like_count).toBe(1);
    await request(app).delete('/profile').set(auth(b)).send({ password: b.password });
    expect((await stored(top.id)).like_count).toBe(0);
  });

  it('replies: in and out, a reply waiting for approval counts once approved, a deleted account', async () => {
    const [a, restricted] = [await registerAndLogin(app), await registerAndLogin(app)];
    const top = await comment(author, 'top');
    const r1 = await comment(a, 'one', top.id);
    await comment(a, 'two', top.id);
    expect((await stored(top.id)).reply_count).toBe(2);
    // The post's author restricts someone: their reply waits (Day 47).
    expect((await request(app).post(`/users/${restricted.id}/restrict`).set(auth(author))).status).toBeLessThan(300);
    const held = await comment(restricted, 'held back', top.id);
    // (The writer is never told it waits: checked in the database.)
    expect((await pool.query('SELECT awaiting_approval FROM comments WHERE id = $1', [held.id])).rows[0].awaiting_approval).toBe(true);
    expect((await stored(top.id)).reply_count).toBe(2);
    expect((await request(app).post(`/comments/${held.id}/approve`).set(auth(author))).status).toBe(200);
    expect((await stored(top.id)).reply_count).toBe(3);
    await request(app).delete(`/comments/${r1.id}`).set(auth(a));
    expect((await stored(top.id)).reply_count).toBe(2);
    await request(app).delete('/profile').set(auth(a)).send({ password: a.password });
    expect((await stored(top.id)).reply_count).toBe(1);
  });

  it('a liked reply moves its own count, never its thread\'s reply count', async () => {
    const a = await registerAndLogin(app);
    const top = await comment(author, 'top');
    const reply = await comment(a, 'reply', top.id);
    await request(app).post(`/comments/${reply.id}/like`).set(auth(author));
    expect(await stored(reply.id)).toEqual({ like_count: 1, reply_count: 0 });
    expect(await stored(top.id)).toEqual({ like_count: 0, reply_count: 1 });
  });

  it('Most relevant ranks by the stored counts: a reply weighs double a reaction', async () => {
    const people = [];
    for (let i = 0; i < 3; i += 1) people.push(await registerAndLogin(app));
    const liked = await comment(author, 'two reactions');
    const replied = await comment(author, 'two replies');
    const quiet = await comment(author, 'nothing');
    for (const p of people.slice(0, 2)) await request(app).post(`/comments/${liked.id}/like`).set(auth(p));
    for (const p of people.slice(0, 2)) await comment(p, 'answer', replied.id);
    const list = (await request(app).get(`/posts/${post.id}/comments?sort=relevant`).set(auth(people[2]))).body.comments;
    const threads = list.filter((c) => c.parent_comment_id === null);
    expect(threads.map((c) => [c.id, c.like_count, c.reply_count])).toEqual([[replied.id, 0, 2], [liked.id, 2, 0], [quiet.id, 0, 0]]);
    // The same order across pages (one thread a page): the ranking, not
    // just each page's own sort.
    const paged = [];
    let cursor = '';
    for (let i = 0; i < 4 && cursor !== null; i += 1) {
      const res = (await request(app).get(`/posts/${post.id}/comments?sort=relevant&limit=1&cursor=${cursor}`).set(auth(people[2]))).body;
      paged.push(...res.comments.filter((c) => c.parent_comment_id === null).map((c) => c.id));
      cursor = res.nextCursor;
    }
    expect(paged).toEqual([replied.id, liked.id, quiet.id]);
  });

  it('deleting a thread or the post removes the counted rows with it', async () => {
    const a = await registerAndLogin(app);
    const top = await comment(author, 'top');
    const reply = await comment(a, 'reply', top.id);
    await request(app).post(`/comments/${reply.id}/like`).set(auth(author));
    expect((await request(app).delete(`/comments/${top.id}`).set(auth(author))).status).toBe(200);
    expect(Number((await pool.query('SELECT count(*) FROM comments WHERE post_id = $1', [post.id])).rows[0].count)).toBe(0);
    const other = await comment(author, 'another');
    await comment(a, 'r', other.id);
    expect((await request(app).delete(`/posts/${post.id}`).set(auth(author))).status).toBe(200);
    expect(Number((await pool.query('SELECT count(*) FROM comment_likes')).rows[0].count)).toBe(0);
  });
});
