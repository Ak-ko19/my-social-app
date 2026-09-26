const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B7 Explore: trending hashtags + popular posts (7-day window).
describe('explore (B7)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = (user, content, visibility) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    if (visibility) req = req.field('visibility', visibility);
    return req.then((r) => r.body);
  };
  const ageHours = async (postId, hours) => {
    const { pool } = require('../helpers/testDb');
    await pool.query(`UPDATE posts SET created_at = now() - ($2 || ' hours')::interval WHERE id = $1`, [postId, String(hours)]);
  };
  const like = (user, p) => request(app).post(`/posts/${p.id}/like`).set(auth(user));
  const commentOn = (user, p) => request(app).post(`/posts/${p.id}/comments`).set(auth(user)).send({ content: 'nice' });

  describe('GET /explore/hashtags', () => {
    it('ranks tags by number of distinct recent posts', async () => {
      const a = await registerAndLogin(app);
      await post(a, '#alpha #beta');
      await post(a, '#alpha again');
      await post(a, '#gamma #alpha #beta');
      const res = await request(app).get('/explore/hashtags');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { tag: 'alpha', post_count: 3 },
        { tag: 'beta', post_count: 2 },
        { tag: 'gamma', post_count: 1 }
      ]);
    });

    it('ignores posts older than 7 days', async () => {
      const a = await registerAndLogin(app);
      const old = await post(a, '#stale');
      await ageHours(old.id, 24 * 8);
      await post(a, '#fresh');
      expect((await request(app).get('/explore/hashtags')).body.map((t) => t.tag)).toEqual(['fresh']);
    });

    it('never counts private-account or followers-only posts (not even as numbers)', async () => {
      const a = await registerAndLogin(app);
      const priv = await registerAndLogin(app);
      await post(a, '#secretish', 'followers');
      await post(priv, '#hidden');
      await request(app).put('/profile/privacy').set(auth(priv)).send({ isPrivate: true });
      await post(a, '#open');
      // Even the author (who can see their own followers-only post) doesn't
      // see it counted in trends.
      expect((await request(app).get('/explore/hashtags').set(auth(a))).body.map((t) => t.tag)).toEqual(['open']);
    });

    it('hides tags that only come from authors the viewer blocked', async () => {
      const viewer = await registerAndLogin(app);
      const blocked = await registerAndLogin(app);
      await post(blocked, '#blockedtopic');
      await request(app).post(`/users/${blocked.id}/block`).set(auth(viewer));
      expect((await request(app).get('/explore/hashtags').set(auth(viewer))).body).toEqual([]);
    });
  });

  describe('GET /explore/posts', () => {
    it('only includes posts with engagement, ranked by score', async () => {
      const author = await registerAndLogin(app);
      const fans = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
      const quiet = await post(author, 'no engagement');
      const one = await post(author, 'one like');
      const three = await post(author, 'three likes');
      await like(fans[0], one);
      for (const f of fans) await like(f, three);

      const res = await request(app).get('/explore/posts');
      expect(res.status).toBe(200);
      const contents = res.body.posts.map((p) => p.content);
      expect(contents).toEqual(['three likes', 'one like']);
      expect(contents).not.toContain(quiet.content);
      expect(res.body.posts[0]).toMatchObject({ like_count: 3, comment_count: 0 });
      expect(res.body.posts[0].score).toBeUndefined();
    });

    it('comments weigh double a reaction', async () => {
      const author = await registerAndLogin(app);
      const f1 = await registerAndLogin(app);
      const f2 = await registerAndLogin(app);
      const liked = await post(author, 'one like');
      const commented = await post(author, 'one comment');
      await like(f1, liked);
      await commentOn(f2, commented);
      expect((await request(app).get('/explore/posts')).body.posts.map((p) => p.content)).toEqual(['one comment', 'one like']);
    });

    it('time decay: a fresh post beats an older one with a bit more engagement', async () => {
      const author = await registerAndLogin(app);
      const fans = [];
      for (let i = 0; i < 3; i++) fans.push(await registerAndLogin(app));
      const older = await post(author, 'older, 3 likes');
      const fresh = await post(author, 'fresh, 2 likes');
      for (const f of fans) await like(f, older);
      await like(fans[0], fresh);
      await like(fans[1], fresh);
      await ageHours(older.id, 48);
      // older: 3 / 50^1.5 ~= 0.0085 ; fresh: 2 / 2^1.5 ~= 0.71
      expect((await request(app).get('/explore/posts')).body.posts.map((p) => p.content)).toEqual(['fresh, 2 likes', 'older, 3 likes']);
    });

    it('excludes posts older than 7 days', async () => {
      const author = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const old = await post(author, 'ancient');
      await like(fan, old);
      await ageHours(old.id, 24 * 8);
      expect((await request(app).get('/explore/posts')).body.posts).toEqual([]);
    });

    it('respects visibility: followers-only posts only for followers; blocks hide authors', async () => {
      const author = await registerAndLogin(app);
      const follower = await registerAndLogin(app);
      const stranger = await registerAndLogin(app);
      await request(app).post(`/users/${author.id}/follow`).set(auth(follower));
      const hidden = await post(author, 'followers only', 'followers');
      await like(follower, hidden);

      const contents = async (user) => (await request(app).get('/explore/posts').set(user ? auth(user) : {})).body.posts.map((p) => p.content);
      expect(await contents(follower)).toEqual(['followers only']);
      expect(await contents(stranger)).toEqual([]);
      expect(await contents(null)).toEqual([]);

      const open = await post(author, 'public popular');
      await like(follower, open);
      await request(app).post(`/users/${author.id}/block`).set(auth(stranger));
      expect(await contents(stranger)).toEqual([]);
    });

    it('paginates with hasMore', async () => {
      const author = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      for (let i = 0; i < 3; i++) await like(fan, await post(author, `p${i}`));
      const first = await request(app).get('/explore/posts').query({ limit: 2 });
      expect(first.body.posts).toHaveLength(2);
      expect(first.body.hasMore).toBe(true);
      const second = await request(app).get('/explore/posts').query({ limit: 2, page: 2 });
      expect(second.body.posts).toHaveLength(1);
      expect(second.body.hasMore).toBe(false);
    });
  });
});
