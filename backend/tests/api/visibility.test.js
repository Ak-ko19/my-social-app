const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// A6 audit: every route that reads from or writes to a post by id must
// apply the same visibility rules as GET /posts/:id (private account,
// block, deactivated author) -- see services/postVisibilityService.js.
describe('post visibility enforcement (A6)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

  async function createPost(author, content = 'visibility test post') {
    const res = await request(app).post('/posts').set(auth(author)).field('content', content);
    return res.body;
  }

  async function makePrivate(user) {
    await request(app).put('/profile/privacy').set(auth(user)).send({ isPrivate: true });
  }

  describe('private account, viewer is not a follower', () => {
    let author;
    let outsider;
    let post;

    beforeEach(async () => {
      author = await registerAndLogin(app);
      outsider = await registerAndLogin(app);
      post = await createPost(author);
      await makePrivate(author);
    });

    it('cannot like the post (404) and the author gets no notification', async () => {
      const res = await request(app).post(`/posts/${post.id}/like`).set(auth(outsider));
      expect(res.status).toBe(404);
      const notes = await request(app).get('/notifications').set(auth(author));
      expect(notes.body.notifications).toHaveLength(0);
    });

    it('cannot comment on the post (404)', async () => {
      const res = await request(app).post(`/posts/${post.id}/comments`).set(auth(outsider)).send({ content: 'hi' });
      expect(res.status).toBe(404);
    });

    it('cannot bookmark the post (404)', async () => {
      const res = await request(app).post(`/posts/${post.id}/bookmark`).set(auth(outsider));
      expect(res.status).toBe(404);
    });

    it('cannot read its comments or like count, logged in or anonymous (404)', async () => {
      expect((await request(app).get(`/posts/${post.id}/comments`).set(auth(outsider))).status).toBe(404);
      expect((await request(app).get(`/posts/${post.id}/comments`)).status).toBe(404);
      expect((await request(app).get(`/posts/${post.id}/likes`)).status).toBe(404);
    });

    it('can do all of it once an accepted follower', async () => {
      await request(app).post(`/users/${author.id}/follow`).set(auth(outsider));
      await request(app).post(`/follow-requests/${outsider.id}/approve`).set(auth(author));

      expect((await request(app).post(`/posts/${post.id}/like`).set(auth(outsider))).status).toBe(201);
      expect((await request(app).post(`/posts/${post.id}/comments`).set(auth(outsider)).send({ content: 'hi' })).status).toBe(201);
      expect((await request(app).get(`/posts/${post.id}/comments`).set(auth(outsider))).status).toBe(200);
    });

    it('the author can still interact with their own private post', async () => {
      expect((await request(app).post(`/posts/${post.id}/comments`).set(auth(author)).send({ content: 'mine' })).status).toBe(201);
      expect((await request(app).get(`/posts/${post.id}/comments`).set(auth(author))).status).toBe(200);
    });
  });

  describe('blocks', () => {
    it('a blocked user cannot like or comment on the blocker\'s post (404)', async () => {
      const author = await registerAndLogin(app);
      const blocked = await registerAndLogin(app);
      const post = await createPost(author);
      await request(app).post(`/users/${blocked.id}/block`).set(auth(author));

      expect((await request(app).post(`/posts/${post.id}/like`).set(auth(blocked))).status).toBe(404);
      expect((await request(app).post(`/posts/${post.id}/comments`).set(auth(blocked)).send({ content: 'x' })).status).toBe(404);
    });

    it('comments from a user the viewer blocked are hidden from the viewer only', async () => {
      const author = await registerAndLogin(app);
      const viewer = await registerAndLogin(app);
      const troll = await registerAndLogin(app);
      const post = await createPost(author);
      await request(app).post(`/posts/${post.id}/comments`).set(auth(troll)).send({ content: 'troll comment' });
      await request(app).post(`/users/${troll.id}/block`).set(auth(viewer));

      const asViewer = await request(app).get(`/posts/${post.id}/comments`).set(auth(viewer));
      expect(asViewer.body.map((c) => c.content)).not.toContain('troll comment');
      const anonymous = await request(app).get(`/posts/${post.id}/comments`);
      expect(anonymous.body.map((c) => c.content)).toContain('troll comment');
    });
  });

  describe('follower/following lists', () => {
    it('a private account\'s lists are 403 to non-followers and anonymous, visible to the owner', async () => {
      const owner = await registerAndLogin(app);
      const outsider = await registerAndLogin(app);
      await makePrivate(owner);

      expect((await request(app).get(`/users/${owner.id}/followers`)).status).toBe(403);
      expect((await request(app).get(`/users/${owner.id}/following`).set(auth(outsider))).status).toBe(403);
      expect((await request(app).get(`/users/${owner.id}/followers`).set(auth(owner))).status).toBe(200);
      // Counts stay public.
      expect((await request(app).get(`/users/${owner.id}/follow-counts`)).status).toBe(200);
    });

    it('a public account\'s lists stay public', async () => {
      const owner = await registerAndLogin(app);
      expect((await request(app).get(`/users/${owner.id}/followers`)).status).toBe(200);
    });
  });

  // Same file, same setupTestApp(): each call registers its own afterAll
  // that closes the shared pool, so a second top-level describe would
  // find it already closed.
  describe('profile update (A6)', () => {

  it('rejects an invalid email format', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app)
      .put('/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ username: user.username, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('changing the email resets email_verified; keeping it does not', async () => {
    const { pool } = require('../helpers/testDb');
    const user = await registerAndLogin(app);
    await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);

    const same = await request(app)
      .put('/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ username: user.username, email: user.email, bio: 'new bio' });
    expect(same.status).toBe(200);
    expect(same.body.email_verified).toBe(true);

    const changed = await request(app)
      .put('/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ username: user.username, email: `changed_${user.email}` });
    expect(changed.status).toBe(200);
    expect(changed.body.email_verified).toBe(false);
  });
});
});
