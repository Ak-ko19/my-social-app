const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B1: reactions extend likes (migration 016). PUT /posts/:id/reaction sets
// or changes; DELETE /posts/:id/like removes; POST /posts/:id/like is the
// original "like" and must keep working.
describe('reactions (B1)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  let author;
  let fan;
  let post;

  beforeEach(async () => {
    author = await registerAndLogin(app);
    fan = await registerAndLogin(app);
    post = (await request(app).post('/posts').set(auth(author)).field('content', 'react to me')).body;
  });

  it('sets a reaction (201) and returns the summary', async () => {
    const res = await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'love' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ myReaction: 'love', likeCount: 1, reactionCounts: { love: 1 } });
  });

  it('changes an existing reaction (200) without adding a second one', async () => {
    await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'love' });
    const res = await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'haha' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ myReaction: 'haha', likeCount: 1, reactionCounts: { haha: 1 } });
  });

  it('notifies the author once on first reaction, not on each change', async () => {
    await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'love' });
    await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'wow' });
    await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'sad' });
    const notes = await request(app).get('/notifications').set(auth(author));
    expect(notes.body.notifications.filter((n) => n.type === 'like')).toHaveLength(1);
  });

  it('rejects an unknown reaction type (400)', async () => {
    const res = await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'meh' });
    expect(res.status).toBe(400);
  });

  it('requires auth (401)', async () => {
    const res = await request(app).put(`/posts/${post.id}/reaction`).send({ reaction: 'love' });
    expect(res.status).toBe(401);
  });

  it('respects post visibility (404 on a private post the viewer cannot see)', async () => {
    await request(app).put('/profile/privacy').set(auth(author)).send({ isPrivate: true });
    const res = await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'love' });
    expect(res.status).toBe(404);
  });

  it('DELETE /like removes any reaction type', async () => {
    await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'angry' });
    const res = await request(app).delete(`/posts/${post.id}/like`).set(auth(fan));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ myReaction: null, likeCount: 0, reactionCounts: {} });
  });

  it('the original POST /like still works and counts as a "like" reaction', async () => {
    const res = await request(app).post(`/posts/${post.id}/like`).set(auth(fan));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ myReaction: 'like', likeCount: 1, reactionCounts: { like: 1 } });
  });

  it('post payloads expose my_reaction and reaction_counts (detail + feed)', async () => {
    const other = await registerAndLogin(app);
    await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'love' });
    await request(app).post(`/posts/${post.id}/like`).set(auth(other));

    const detail = await request(app).get(`/posts/${post.id}`).set(auth(fan));
    expect(detail.body.my_reaction).toBe('love');
    expect(detail.body.reaction_counts).toEqual({ love: 1, like: 1 });
    expect(detail.body.like_count).toBe(2);

    await request(app).post(`/users/${author.id}/follow`).set(auth(fan));
    const feed = await request(app).get('/feed').set(auth(fan));
    const inFeed = feed.body.posts.find((p) => p.id === post.id);
    expect(inFeed.my_reaction).toBe('love');
    expect(inFeed.reaction_counts).toEqual({ love: 1, like: 1 });

    const anonymous = await request(app).get(`/posts/${post.id}`);
    expect(anonymous.body.my_reaction).toBeNull();
  });
});
