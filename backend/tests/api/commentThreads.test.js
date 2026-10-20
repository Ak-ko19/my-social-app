const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B4: one-level comment replies + comment likes (migration 019).
describe('comment replies + likes (B4)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  let author;
  let alice;
  let bob;
  let post;

  const comment = (user, content, parentCommentId) =>
    request(app).post(`/posts/${post.id}/comments`).set(auth(user)).send({ content, parentCommentId });
  const notesOf = async (user) => (await request(app).get('/notifications').set(auth(user))).body.notifications;

  beforeEach(async () => {
    author = await registerAndLogin(app);
    alice = await registerAndLogin(app);
    bob = await registerAndLogin(app);
    post = (await request(app).post('/posts').set(auth(author)).field('content', 'discuss')).body;
  });

  it('creates a reply under a top-level comment', async () => {
    const top = (await comment(alice, 'top')).body;
    const reply = await comment(bob, 'a reply', top.id);
    expect(reply.status).toBe(201);
    expect(reply.body.parent_comment_id).toBe(top.id);

    const list = (await request(app).get(`/posts/${post.id}/comments`)).body.comments;
    expect(list.map((c) => [c.content, c.parent_comment_id])).toEqual([['top', null], ['a reply', top.id]]);
  });

  it('replying to a reply attaches to the top-level comment (one level deep)', async () => {
    const top = (await comment(alice, 'top')).body;
    const reply = (await comment(bob, 'reply', top.id)).body;
    const nested = await comment(alice, 'reply to reply', reply.id);
    expect(nested.status).toBe(201);
    expect(nested.body.parent_comment_id).toBe(top.id);
  });

  it('rejects a parent from another post, or a nonexistent parent (400)', async () => {
    const otherPost = (await request(app).post('/posts').set(auth(author)).field('content', 'other')).body;
    const foreign = (await request(app).post(`/posts/${otherPost.id}/comments`).set(auth(alice)).send({ content: 'x' })).body;
    expect((await comment(bob, 'nope', foreign.id)).status).toBe(400);
    expect((await comment(bob, 'nope', 999999)).status).toBe(400);
    expect((await comment(bob, 'nope', 'abc')).status).toBe(400);
  });

  it('notifies the replied-to author with "reply", and the post owner with "comment"', async () => {
    const top = (await comment(alice, 'top')).body;
    await comment(bob, 'hi alice', top.id);

    const aliceNotes = await notesOf(alice);
    expect(aliceNotes.map((n) => n.type)).toEqual(['reply']);
    const authorNotes = await notesOf(author);
    // alice's top-level comment + bob's reply
    expect(authorNotes.filter((n) => n.type === 'comment')).toHaveLength(2);
  });

  it('the post owner replied to gets one "reply" notification, not also "comment"', async () => {
    const top = (await comment(author, 'owner speaks')).body;
    await comment(alice, 'answering the owner', top.id);
    const types = (await notesOf(author)).map((n) => n.type);
    expect(types).toEqual(['reply']);
  });

  it('a reply that @mentions the replied-to person notifies them once ("reply"), not also "mention"', async () => {
    const top = (await comment(alice, 'top')).body;
    await comment(bob, `@${alice.username} good point`, top.id);
    expect((await notesOf(alice)).map((n) => n.type)).toEqual(['reply']);
  });

  it('other people @mentioned in a reply still get "mention"', async () => {
    const carol = await registerAndLogin(app);
    const top = (await comment(alice, 'top')).body;
    await comment(bob, `@${alice.username} @${carol.username} look`, top.id);
    expect((await notesOf(carol)).map((n) => n.type)).toEqual(['mention']);
  });

  it('deleting a top-level comment deletes its replies', async () => {
    const top = (await comment(alice, 'top')).body;
    await comment(bob, 'reply', top.id);
    expect((await request(app).delete(`/comments/${top.id}`).set(auth(alice))).status).toBe(200);
    expect((await request(app).get(`/posts/${post.id}/comments`)).body.comments).toHaveLength(0);
  });

  it('likes and unlikes a comment (idempotent), with counts and liked_by_me', async () => {
    const top = (await comment(alice, 'likeable')).body;
    const first = await request(app).post(`/comments/${top.id}/like`).set(auth(bob));
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ likedByMe: true, likeCount: 1 });
    const again = await request(app).post(`/comments/${top.id}/like`).set(auth(bob));
    expect(again.status).toBe(200);
    expect(again.body.likeCount).toBe(1);

    const asBob = (await request(app).get(`/posts/${post.id}/comments`).set(auth(bob))).body.comments[0];
    expect(asBob).toMatchObject({ like_count: 1, liked_by_me: true });
    const anon = (await request(app).get(`/posts/${post.id}/comments`)).body.comments[0];
    expect(anon).toMatchObject({ like_count: 1, liked_by_me: false });

    const un = await request(app).delete(`/comments/${top.id}/like`).set(auth(bob));
    expect(un.body).toEqual({ likedByMe: false, likeCount: 0 });
  });

  it('notifies the comment author once on first like, never for self-likes', async () => {
    const top = (await comment(alice, 'likeable')).body;
    await request(app).post(`/comments/${top.id}/like`).set(auth(bob));
    await request(app).delete(`/comments/${top.id}/like`).set(auth(bob));
    await request(app).post(`/comments/${top.id}/like`).set(auth(alice)); // self
    const types = (await notesOf(alice)).map((n) => n.type);
    expect(types).toEqual(['comment_like']);
  });

  it('cannot like a comment on a post the viewer cannot see (404), or across a block', async () => {
    const top = (await comment(alice, 'x')).body;
    await request(app).post(`/users/${bob.id}/block`).set(auth(alice));
    expect((await request(app).post(`/comments/${top.id}/like`).set(auth(bob))).status).toBe(404);

    await request(app).put('/profile/privacy').set(auth(author)).send({ isPrivate: true });
    const outsider = await registerAndLogin(app);
    expect((await request(app).post(`/comments/${top.id}/like`).set(auth(outsider))).status).toBe(404);
    expect((await request(app).post('/comments/999999/like').set(auth(outsider))).status).toBe(404);
  });
});
