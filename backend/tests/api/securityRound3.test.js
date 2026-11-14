const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Days 114-115 (security round 3): the routes added since Day 76, probed for
// what their own feature tests don't try -- reading or acting on something
// the person may not see, or that isn't theirs. Each case is the safe answer.
describe('security round 3: routes added since Day 76', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));
  const post = async (user, fields = {}) => {
    const req = request(app).post('/posts').set(auth(user)).field('content', fields.content ?? 'a post');
    for (const [k, v] of Object.entries(fields)) if (k !== 'content') req.field(k, v);
    return (await req).body;
  };
  const comment = async (user, postId, content = 'a comment', parentId) =>
    (await request(app).post(`/posts/${postId}/comments`).set(auth(user)).send({ content, ...(parentId ? { parentCommentId: parentId } : {}) })).body;
  const story = async (user, fields = {}) => {
    const req = request(app).post('/stories').set(auth(user));
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return (await req.attach('image', png, { filename: 's.png', contentType: 'image/png' })).body;
  };

  describe('GET /comments/:id/replies', () => {
    it('a followers-only post\'s thread: not for a stranger, nor logged out', async () => {
      const author = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const stranger = await registerAndLogin(app);
      await follow(fan, author);
      const p = await post(author, { visibility: 'followers' });
      const top = await comment(fan, p.id);
      expect(top.id).toBeDefined();
      await comment(author, p.id, 'a reply', top.id);
      expect((await request(app).get(`/comments/${top.id}/replies`).set(auth(fan))).body.replies.length).toBe(1);
      expect((await request(app).get(`/comments/${top.id}/replies`).set(auth(stranger))).status).toBe(404);
      expect((await request(app).get(`/comments/${top.id}/replies`)).status).toBe(404);
    });

    it('across a block (either way): not found', async () => {
      const author = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const p = await post(author);
      const top = await comment(author, p.id);
      await request(app).post(`/users/${other.id}/block`).set(auth(author));
      expect((await request(app).get(`/comments/${top.id}/replies`).set(auth(other))).status).toBe(404);
    });

    it('a reply\'s id is not a thread', async () => {
      const author = await registerAndLogin(app);
      const p = await post(author);
      const top = await comment(author, p.id);
      const r = await comment(author, p.id, 'r', top.id);
      expect((await request(app).get(`/comments/${r.id}/replies`).set(auth(author))).status).toBe(404);
    });
  });

  describe('stories: reply and react', () => {
    it('a close-friends story: only the people on the list', async () => {
      const author = await registerAndLogin(app);
      const friend = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      await follow(friend, author);
      await follow(fan, author);
      await request(app).put(`/close-friends/${friend.id}`).set(auth(author));
      const s = await story(author, { closeFriends: 'true' });
      expect((await request(app).post(`/stories/${s.id}/reply`).set(auth(fan)).send({ text: 'hi' })).status).toBe(404);
      expect((await request(app).post(`/stories/${s.id}/react`).set(auth(fan)).send({ emoji: '❤️' })).status).toBe(404);
      expect((await request(app).post(`/stories/${s.id}/reply`).set(auth(friend)).send({ text: 'hi' })).status).toBe(201);
    });

    it('a private account\'s story: not for someone whose request waits', async () => {
      const author = await registerAndLogin(app);
      const asker = await registerAndLogin(app);
      await request(app).put('/profile/privacy').set(auth(author)).send({ isPrivate: true });
      await follow(asker, author); // a request, not accepted
      const s = await story(author);
      expect((await request(app).post(`/stories/${s.id}/reply`).set(auth(asker)).send({ text: 'hi' })).status).toBe(404);
    });

    it('an expired story: not found', async () => {
      const author = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      await follow(fan, author);
      const s = await story(author);
      await pool.query("UPDATE stories SET expires_at = now() - interval '1 minute' WHERE id = $1", [s.id]);
      expect((await request(app).post(`/stories/${s.id}/reply`).set(auth(fan)).send({ text: 'hi' })).status).toBe(404);
    });
  });

  describe('posts: share and edit photos', () => {
    it('a share with content that is not text is refused, and nothing is posted', async () => {
      const author = await registerAndLogin(app);
      const sharer = await registerAndLogin(app);
      const p = await post(author);
      for (const content of [123, { a: 1 }, ['x'], true]) {
        const res = await request(app).post(`/posts/${p.id}/share`).set(auth(sharer)).send({ content });
        expect(res.status).toBe(400);
      }
      expect((await pool.query('SELECT count(*)::int AS n FROM posts WHERE user_id = $1', [sharer.id])).rows[0].n).toBe(0);
    });

    it('someone else\'s post\'s photos: not theirs to change', async () => {
      const author = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const p = await post(author);
      const res = await request(app).put(`/posts/${p.id}/media`).set(auth(other)).field('photos', '[]');
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('pages: verification', () => {
    it('a page\'s verification state and requests are for its managers only', async () => {
      const owner = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'A page' })).body;
      expect((await request(app).get(`/pages/${page.id}/verification`).set(auth(owner))).status).toBe(200);
      for (const [method, body] of [['get'], ['post', { note: 'please verify us, we are real' }], ['delete']]) {
        const res = await request(app)[method](`/pages/${page.id}/verification`).set(auth(other)).send(body);
        expect([403, 404]).toContain(res.status);
      }
      expect((await pool.query('SELECT count(*)::int AS n FROM page_verification_requests')).rows[0].n).toBe(0);
    });
  });

  describe('groups: post notification level', () => {
    it('a private group: a non-member can\'t set it (and learns nothing)', async () => {
      const admin = await registerAndLogin(app);
      const outsider = await registerAndLogin(app);
      const group = (await request(app).post('/communities').set(auth(admin)).send({ name: 'Secret', privacy: 'private' })).body;
      const res = await request(app).put(`/communities/${group.id}/notifications`).set(auth(outsider)).send({ level: 'all' });
      expect([403, 404]).toContain(res.status);
    });
  });
});
