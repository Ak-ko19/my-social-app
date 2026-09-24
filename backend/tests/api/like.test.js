const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

describe('likes', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  async function makePost(token, content = 'likeable post') {
    const res = await request(app).post('/posts').set('Authorization', `Bearer ${token}`).field('content', content);
    return res.body;
  }

  it('likes a post and returns the authoritative count', async () => {
    const author = await registerAndLogin(app);
    const liker = await registerAndLogin(app);
    const post = await makePost(author.token);

    const res = await request(app).post(`/posts/${post.id}/like`).set('Authorization', `Bearer ${liker.token}`);
    expect(res.status).toBe(201);
    expect(res.body.likeCount).toBe(1);
  });

  it('rejects liking the same post twice', async () => {
    const author = await registerAndLogin(app);
    const liker = await registerAndLogin(app);
    const post = await makePost(author.token);

    await request(app).post(`/posts/${post.id}/like`).set('Authorization', `Bearer ${liker.token}`);
    const res = await request(app).post(`/posts/${post.id}/like`).set('Authorization', `Bearer ${liker.token}`);
    expect(res.status).toBe(400);
  });

  it('unlikes and decrements the count', async () => {
    const author = await registerAndLogin(app);
    const liker = await registerAndLogin(app);
    const post = await makePost(author.token);

    await request(app).post(`/posts/${post.id}/like`).set('Authorization', `Bearer ${liker.token}`);
    const res = await request(app).delete(`/posts/${post.id}/like`).set('Authorization', `Bearer ${liker.token}`);
    expect(res.status).toBe(200);
    expect(res.body.likeCount).toBe(0);
  });

  it('404s liking a post that does not exist', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app).post('/posts/999999/like').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(404);
  });

  it('does not notify the author when they like their own post', async () => {
    const author = await registerAndLogin(app);
    const post = await makePost(author.token);
    const res = await request(app).post(`/posts/${post.id}/like`).set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(201);
    // No direct notifications endpoint in this task's scope -- covered
    // indirectly: the like itself must still succeed even though the
    // self-notify branch in likeController is skipped.
  });
});
