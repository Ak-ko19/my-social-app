const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

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

    // Audit bug #3: your own posts never appeared on Home, so a new post
    // seemed to vanish right after posting.
    it("includes the viewer's own posts, newest first, a new post at the top", async () => {
      const viewer = await registerAndLogin(app);
      const followed = await registerAndLogin(app);
      await request(app).post(`/users/${followed.id}/follow`).set('Authorization', `Bearer ${viewer.token}`);
      await createPost(app, followed.token, 'older, from a friend');
      const followersOnly = await request(app).post('/posts').set('Authorization', `Bearer ${viewer.token}`)
        .field('content', 'mine, followers only').field('visibility', 'followers');
      expect(followersOnly.status).toBe(201);
      const fresh = await createPost(app, viewer.token, 'just posted');

      const res = await request(app).get('/feed').set('Authorization', `Bearer ${viewer.token}`);
      expect(res.status).toBe(200);
      expect(res.body.posts.map((p) => p.content)).toEqual(['just posted', 'mine, followers only', 'older, from a friend']);
      expect(res.body.posts[0]).toMatchObject({ id: fresh.id, user_id: viewer.id, is_following: false });
    });

    it("shows a brand-new user's first post even though they follow nobody", async () => {
      const newbie = await registerAndLogin(app);
      await createPost(app, newbie.token, 'hello world, first post');
      const res = await request(app).get('/feed').set('Authorization', `Bearer ${newbie.token}`);
      expect(res.body.posts.map((p) => p.content)).toEqual(['hello world, first post']);
    });

    it("does not put the viewer's posts in anyone else's feed without a follow", async () => {
      const author = await registerAndLogin(app);
      const stranger = await registerAndLogin(app);
      await createPost(app, author.token, 'not for strangers');
      const res = await request(app).get('/feed').set('Authorization', `Bearer ${stranger.token}`);
      expect(res.body.posts).toEqual([]);
    });

    it('pages through own + followed posts without duplicates or gaps', async () => {
      const viewer = await registerAndLogin(app);
      const followed = await registerAndLogin(app);
      await request(app).post(`/users/${followed.id}/follow`).set('Authorization', `Bearer ${viewer.token}`);
      const created = [];
      for (let i = 0; i < 5; i += 1) {
        created.push((await createPost(app, (i % 2 ? followed : viewer).token, `post ${i}`)).id);
      }
      const page = async (n) => (await request(app).get(`/feed?page=${n}&limit=2`).set('Authorization', `Bearer ${viewer.token}`)).body;
      const [p1, p2, p3] = [await page(1), await page(2), await page(3)];
      expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false]);
      expect([...p1.posts, ...p2.posts, ...p3.posts].map((p) => p.id)).toEqual(created.reverse());
    });

    it('keeps a stable order when posts share a timestamp', async () => {
      const viewer = await registerAndLogin(app);
      const ids = [];
      for (let i = 0; i < 3; i += 1) ids.push((await createPost(app, viewer.token, `tie ${i}`)).id);
      // As rows written in one transaction (e.g. the demo seed) would be.
      await pool.query("UPDATE posts SET created_at = '2026-01-01 12:00:00' WHERE id = ANY($1)", [ids]);
      const seen = [];
      for (let n = 1; n <= 3; n += 1) {
        const res = await request(app).get(`/feed?page=${n}&limit=1`).set('Authorization', `Bearer ${viewer.token}`);
        seen.push(...res.body.posts.map((p) => p.id));
      }
      expect(seen).toEqual([...ids].reverse());
    });

    // Day 74: the cursor pages the feed without OFFSET.
    describe('with ?cursor=', () => {
      const walk = async (token, limit) => {
        const seen = [];
        let cursor = null;
        for (let n = 0; n < 10; n += 1) {
          const res = await request(app).get('/feed').query({ limit, ...(cursor && { cursor }) }).set('Authorization', `Bearer ${token}`);
          expect(res.status).toBe(200);
          seen.push(...res.body.posts.map((p) => p.id));
          cursor = res.body.nextCursor;
          expect(Boolean(cursor)).toBe(res.body.hasMore);
          if (!cursor) break;
        }
        return seen;
      };

      it('walks own + followed posts, newest first, without duplicates or gaps', async () => {
        const viewer = await registerAndLogin(app);
        const followed = await registerAndLogin(app);
        await request(app).post(`/users/${followed.id}/follow`).set('Authorization', `Bearer ${viewer.token}`);
        const created = [];
        for (let i = 0; i < 5; i += 1) created.push((await createPost(app, (i % 2 ? followed : viewer).token, `c ${i}`)).id);
        expect(await walk(viewer.token, 2)).toEqual(created.reverse());
      });

      it('keeps every post that shares a timestamp down to the microsecond', async () => {
        const viewer = await registerAndLogin(app);
        const ids = [];
        for (let i = 0; i < 4; i += 1) ids.push((await createPost(app, viewer.token, `same time ${i}`)).id);
        // Same millisecond, different microseconds -- a JS Date would merge them.
        await pool.query(`UPDATE posts SET created_at = '2026-01-01 12:00:00.123'::timestamp + (id % 2) * interval '1 microsecond'
          WHERE id = ANY($1)`, [ids]);
        const seen = await walk(viewer.token, 1);
        expect([...seen].sort()).toEqual([...ids].sort());
        expect(seen).toHaveLength(4);
      });

      it('still finds its place when the post the cursor names was deleted', async () => {
        const viewer = await registerAndLogin(app);
        const ids = [];
        for (let i = 0; i < 4; i += 1) ids.push((await createPost(app, viewer.token, `d ${i}`)).id);
        const first = (await request(app).get('/feed?limit=2').set('Authorization', `Bearer ${viewer.token}`)).body;
        expect(first.posts.map((p) => p.id)).toEqual([ids[3], ids[2]]);
        await request(app).delete(`/posts/${ids[2]}`).set('Authorization', `Bearer ${viewer.token}`);
        const next = await request(app).get('/feed').query({ limit: 2, cursor: first.nextCursor }).set('Authorization', `Bearer ${viewer.token}`);
        expect(next.body.posts.map((p) => p.id)).toEqual([ids[1], ids[0]]);
        expect(next.body).toMatchObject({ hasMore: false, nextCursor: null });
      });

      it('still finds its place when the deleted post was the newest of all', async () => {
        const viewer = await registerAndLogin(app);
        const ids = [];
        for (let i = 0; i < 3; i += 1) ids.push((await createPost(app, viewer.token, `n ${i}`)).id);
        const first = (await request(app).get('/feed?limit=1').set('Authorization', `Bearer ${viewer.token}`)).body;
        expect(first.posts.map((p) => p.id)).toEqual([ids[2]]);
        await request(app).delete(`/posts/${ids[2]}`).set('Authorization', `Bearer ${viewer.token}`);
        const next = await request(app).get('/feed').query({ limit: 2, cursor: first.nextCursor }).set('Authorization', `Bearer ${viewer.token}`);
        expect(next.body.posts.map((p) => p.id)).toEqual([ids[1], ids[0]]);
      });

      it('refuses a cursor it cannot read', async () => {
        const viewer = await registerAndLogin(app);
        const res = await request(app).get('/feed?cursor=not-a-cursor').set('Authorization', `Bearer ${viewer.token}`);
        expect(res.status).toBe(400);
        expect(res.text).toBe('Invalid cursor');
      });
    });

    it("leaves the viewer's own page and group posts to their usual rules", async () => {
      const owner = await registerAndLogin(app);
      const page = (await request(app).post('/pages').set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'My Cafe', category: 'business' })).body;
      const group = (await request(app).post('/communities').set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'My Group' })).body;
      await request(app).post('/posts').set('Authorization', `Bearer ${owner.token}`)
        .field('content', 'as the page').field('pageId', String(page.id));
      await request(app).post('/posts').set('Authorization', `Bearer ${owner.token}`)
        .field('content', 'in the group').field('communityId', String(group.id));
      await createPost(app, owner.token, 'personal');

      const res = await request(app).get('/feed').set('Authorization', `Bearer ${owner.token}`);
      // Page posts reach Home through page follows; group posts stay in the group.
      expect(res.body.posts.map((p) => p.content)).toEqual(['personal']);
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
