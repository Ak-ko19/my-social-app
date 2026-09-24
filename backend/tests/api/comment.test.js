const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

describe('comments', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  async function makePost(token, content = 'commentable post') {
    const res = await request(app).post('/posts').set('Authorization', `Bearer ${token}`).field('content', content);
    return res.body;
  }

  it('creates a comment on a post', async () => {
    const author = await registerAndLogin(app);
    const commenter = await registerAndLogin(app);
    const post = await makePost(author.token);

    const res = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ content: 'nice post!' });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('nice post!');
  });

  it('rejects an empty comment', async () => {
    const author = await registerAndLogin(app);
    const post = await makePost(author.token);
    const res = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ content: '' });
    expect(res.status).toBe(400);
  });

  it('lists comments oldest-first', async () => {
    const author = await registerAndLogin(app);
    const post = await makePost(author.token);
    await request(app).post(`/posts/${post.id}/comments`).set('Authorization', `Bearer ${author.token}`).send({ content: 'first' });
    await request(app).post(`/posts/${post.id}/comments`).set('Authorization', `Bearer ${author.token}`).send({ content: 'second' });

    const res = await request(app).get(`/posts/${post.id}/comments`);
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.content)).toEqual(['first', 'second']);
  });

  it('rejects editing someone else\'s comment with 403', async () => {
    const author = await registerAndLogin(app);
    const commenter = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const post = await makePost(author.token);
    const commentRes = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ content: 'mine' });

    const res = await request(app)
      .put(`/comments/${commentRes.body.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ content: 'hijacked' });
    expect(res.status).toBe(403);
  });

  it('lets the owner delete their own comment', async () => {
    const author = await registerAndLogin(app);
    const post = await makePost(author.token);
    const commentRes = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ content: 'delete me' });

    const res = await request(app).delete(`/comments/${commentRes.body.id}`).set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(200);

    const list = await request(app).get(`/posts/${post.id}/comments`);
    expect(list.body).toHaveLength(0);
  });

  it('404s commenting on a post that does not exist', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app)
      .post('/posts/999999/comments')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ content: 'orphan comment' });
    expect(res.status).toBe(404);
  });
});
