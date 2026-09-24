const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

describe('bookmarks', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  async function makePost(token, content = 'bookmarkable post') {
    const res = await request(app).post('/posts').set('Authorization', `Bearer ${token}`).field('content', content);
    return res.body;
  }

  it('bookmarks a post and lists it back', async () => {
    const author = await registerAndLogin(app);
    const saver = await registerAndLogin(app);
    const post = await makePost(author.token);

    const res = await request(app).post(`/posts/${post.id}/bookmark`).set('Authorization', `Bearer ${saver.token}`);
    expect(res.status).toBe(201);

    const list = await request(app).get('/bookmarks').set('Authorization', `Bearer ${saver.token}`);
    expect(list.body.posts.map((p) => p.id)).toContain(post.id);
  });

  it('rejects a duplicate bookmark', async () => {
    const author = await registerAndLogin(app);
    const saver = await registerAndLogin(app);
    const post = await makePost(author.token);
    await request(app).post(`/posts/${post.id}/bookmark`).set('Authorization', `Bearer ${saver.token}`);
    const res = await request(app).post(`/posts/${post.id}/bookmark`).set('Authorization', `Bearer ${saver.token}`);
    expect(res.status).toBe(400);
  });

  it('unbookmarks a post', async () => {
    const author = await registerAndLogin(app);
    const saver = await registerAndLogin(app);
    const post = await makePost(author.token);
    await request(app).post(`/posts/${post.id}/bookmark`).set('Authorization', `Bearer ${saver.token}`);

    const res = await request(app).delete(`/posts/${post.id}/bookmark`).set('Authorization', `Bearer ${saver.token}`);
    expect(res.status).toBe(200);

    const list = await request(app).get('/bookmarks').set('Authorization', `Bearer ${saver.token}`);
    expect(list.body.posts.map((p) => p.id)).not.toContain(post.id);
  });

  it('a bookmarked post from a since-blocked author disappears from the list', async () => {
    const author = await registerAndLogin(app);
    const saver = await registerAndLogin(app);
    const post = await makePost(author.token);
    await request(app).post(`/posts/${post.id}/bookmark`).set('Authorization', `Bearer ${saver.token}`);

    await request(app).post(`/users/${author.id}/block`).set('Authorization', `Bearer ${saver.token}`);

    const list = await request(app).get('/bookmarks').set('Authorization', `Bearer ${saver.token}`);
    expect(list.body.posts.map((p) => p.id)).not.toContain(post.id);
  });
});
