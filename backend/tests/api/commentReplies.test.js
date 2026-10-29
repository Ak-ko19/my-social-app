const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Days 109-110: a thread shows its first 2 replies; GET /comments/:id/replies
// has the rest, with the list's own rules (blocks, waiting for approval).
describe('comment replies on demand (Days 109-110)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const say = (user, content, parentCommentId) =>
    request(app).post(`/posts/${post.id}/comments`).set(auth(user)).send({ content, parentCommentId });
  const list = async (user, query = {}) => {
    const req = request(app).get(`/posts/${post.id}/comments`).query(query);
    return (await (user ? req.set(auth(user)) : req)).body;
  };
  const replies = async (user, id, query = {}) => {
    const req = request(app).get(`/comments/${id}/replies`).query(query);
    return user ? req.set(auth(user)) : req;
  };

  let author;
  let alice;
  let bob;
  let post;
  beforeEach(async () => {
    author = await registerAndLogin(app);
    alice = await registerAndLogin(app);
    bob = await registerAndLogin(app);
    post = (await request(app).post('/posts').set(auth(author)).field('content', 'discuss')).body;
  });

  it('a thread comes with its first 2 replies and how many there are; the rest page oldest first', async () => {
    const top = (await say(alice, 'top')).body;
    for (let i = 1; i <= 5; i++) await say(bob, `r${i}`, top.id);
    const page = await list(null);
    expect(page.comments.map((c) => c.content)).toEqual(['top', 'r1', 'r2']);
    expect(page.comments[0].reply_count).toBe(5);

    const r2 = page.comments[2];
    const next = (await replies(null, top.id, { cursor: r2.id, limit: 2 })).body;
    expect(next.replies.map((r) => r.content)).toEqual(['r3', 'r4']);
    const last = (await replies(null, top.id, { cursor: next.nextCursor, limit: 2 })).body;
    expect([last.replies.map((r) => r.content), last.nextCursor]).toEqual([['r5'], null]);
    expect((await replies(null, top.id)).body.replies).toHaveLength(5);
  });

  it("replies follow the list's rules: a block hides them (and the count), a held one is seen by its author and the post's owner only", async () => {
    const top = (await say(alice, 'top')).body;
    await say(bob, 'from bob', top.id);
    await request(app).post(`/users/${alice.id}/restrict`).set(auth(author));
    await say(alice, 'held reply', top.id);
    await say(author, 'from the author', top.id);

    const shown = (user) => replies(user, top.id).then((res) => res.body.replies.map((r) => r.content));
    expect(await shown(null)).toEqual(['from bob', 'from the author']);
    expect(await shown(alice)).toEqual(['from bob', 'held reply', 'from the author']);
    expect(await shown(author)).toEqual(['from bob', 'held reply', 'from the author']);
    expect((await list(null)).comments[0].reply_count).toBe(2);
    expect((await list(author)).comments[0].reply_count).toBe(3);

    await request(app).post(`/users/${bob.id}/block`).set(auth(author));
    expect(await shown(author)).toEqual(['held reply', 'from the author']);
    expect((await list(author)).comments[0].reply_count).toBe(2);
  });

  it('not found: a reply (only threads have replies), a comment you may not see, a post you may not see; bad cursors refused', async () => {
    const top = (await say(alice, 'top')).body;
    const reply = (await say(bob, 'reply', top.id)).body;
    expect((await replies(null, reply.id)).status).toBe(404);
    expect((await replies(null, 999999)).status).toBe(404);
    await request(app).post(`/users/${alice.id}/block`).set(auth(bob));
    expect((await replies(bob, top.id)).status).toBe(404);
    await request(app).put(`/posts/${post.id}`).set(auth(author)).send({ visibility: 'only_me' });
    expect((await replies(alice, top.id)).status).toBe(404);
    expect((await replies(author, top.id)).status).toBe(200);
    expect((await replies(author, top.id, { cursor: 'x' })).status).toBe(400);
  });
});
