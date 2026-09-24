const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

async function createPost(app, token, content = 'hello world') {
  const res = await request(app).post('/posts').set('Authorization', `Bearer ${token}`).field('content', content);
  expect(res.status).toBe(201);
  return res.body;
}

describe('posts + feed', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  describe('POST /posts', () => {
    it('creates a text post', async () => {
      const user = await registerAndLogin(app);
      const post = await createPost(app, user.token, 'my first post #hello @nobody');
      expect(post.content).toBe('my first post #hello @nobody');
      expect(post.user_id).toBe(user.id);
    });

    it('rejects empty content', async () => {
      const user = await registerAndLogin(app);
      const res = await request(app).post('/posts').set('Authorization', `Bearer ${user.token}`).field('content', '   ');
      expect(res.status).toBe(400);
    });

    it('requires auth', async () => {
      const res = await request(app).post('/posts').field('content', 'no token');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /posts (discovery feed)', () => {
    it('lists posts newest first with pagination', async () => {
      const user = await registerAndLogin(app);
      await createPost(app, user.token, 'first');
      await createPost(app, user.token, 'second');
      const res = await request(app).get('/posts?limit=1');
      expect(res.status).toBe(200);
      expect(res.body.posts).toHaveLength(1);
      expect(res.body.posts[0].content).toBe('second');
      expect(res.body.hasMore).toBe(true);
    });

    it("excludes a private account's posts from a non-follower", async () => {
      const author = await registerAndLogin(app);
      await createPost(app, author.token, 'private author post');
      await request(app).put('/profile/privacy').set('Authorization', `Bearer ${author.token}`).send({ isPrivate: true });

      const viewer = await registerAndLogin(app);
      const res = await request(app).get('/posts').set('Authorization', `Bearer ${viewer.token}`);
      expect(res.body.posts.find((p) => p.content === 'private author post')).toBeUndefined();
    });

    it('excludes posts from a user who blocked the viewer', async () => {
      const author = await registerAndLogin(app);
      await createPost(app, author.token, 'blocked-visibility post');
      const viewer = await registerAndLogin(app);
      await request(app).post(`/users/${viewer.id}/block`).set('Authorization', `Bearer ${author.token}`);

      const res = await request(app).get('/posts').set('Authorization', `Bearer ${viewer.token}`);
      expect(res.body.posts.find((p) => p.content === 'blocked-visibility post')).toBeUndefined();
    });
  });

  describe('GET /feed', () => {
    it('only shows posts from accepted follows', async () => {
      const viewer = await registerAndLogin(app);
      const followed = await registerAndLogin(app);
      const notFollowed = await registerAndLogin(app);
      await createPost(app, followed.token, 'from someone I follow');
      await createPost(app, notFollowed.token, 'from a stranger');

      await request(app).post(`/users/${followed.id}/follow`).set('Authorization', `Bearer ${viewer.token}`);

      const res = await request(app).get('/feed').set('Authorization', `Bearer ${viewer.token}`);
      expect(res.status).toBe(200);
      const contents = res.body.posts.map((p) => p.content);
      expect(contents).toContain('from someone I follow');
      expect(contents).not.toContain('from a stranger');
    });
  });

  describe('GET /posts/:id', () => {
    it('404s (not 403) for a private post the viewer cannot see', async () => {
      const author = await registerAndLogin(app);
      const post = await createPost(app, author.token, 'secret');
      await request(app).put('/profile/privacy').set('Authorization', `Bearer ${author.token}`).send({ isPrivate: true });

      const viewer = await registerAndLogin(app);
      const res = await request(app).get(`/posts/${post.id}`).set('Authorization', `Bearer ${viewer.token}`);
      expect(res.status).toBe(404);
    });

    it('is visible to the author themselves even when private', async () => {
      const author = await registerAndLogin(app);
      const post = await createPost(app, author.token, 'my own secret');
      await request(app).put('/profile/privacy').set('Authorization', `Bearer ${author.token}`).send({ isPrivate: true });

      const res = await request(app).get(`/posts/${post.id}`).set('Authorization', `Bearer ${author.token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /posts/:id and DELETE /posts/:id (ownership)', () => {
    it('lets the owner edit their post', async () => {
      const user = await registerAndLogin(app);
      const post = await createPost(app, user.token, 'original');
      const res = await request(app)
        .put(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ content: 'edited' });
      expect(res.status).toBe(200);
      expect(res.body.content).toBe('edited');
    });

    it('rejects editing someone else\'s post with 403', async () => {
      const owner = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const post = await createPost(app, owner.token, 'not yours');
      const res = await request(app)
        .put(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ content: 'hijacked' });
      expect(res.status).toBe(403);
    });

    it('rejects deleting someone else\'s post with 403', async () => {
      const owner = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const post = await createPost(app, owner.token, 'not yours either');
      const res = await request(app).delete(`/posts/${post.id}`).set('Authorization', `Bearer ${other.token}`);
      expect(res.status).toBe(403);
    });

    it('lets the owner delete their own post', async () => {
      const user = await registerAndLogin(app);
      const post = await createPost(app, user.token, 'delete me');
      const res = await request(app).delete(`/posts/${post.id}`).set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(200);
      const getRes = await request(app).get(`/posts/${post.id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
