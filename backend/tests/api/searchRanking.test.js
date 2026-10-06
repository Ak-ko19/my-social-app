const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 42: ranked search -- people (exact, prefix, followed, shorter) and
// posts (full-text + substring, relevance x popularity x freshness).
describe('ranked search (Day 42)', () => {
  const { app, reset } = setupTestApp();
  // After setupTestApp, so the controller gets the mocked db.
  const { SEARCH_CANDIDATES } = require('../../controllers/searchController');
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = (user, content, visibility) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    if (visibility) req = req.field('visibility', visibility);
    return req.then((r) => r.body);
  };
  const like = (user, p) => request(app).post(`/posts/${p.id}/like`).set(auth(user));
  const ageDays = (postId, days) =>
    pool.query(`UPDATE posts SET created_at = now() - ($2 || ' days')::interval WHERE id = $1`, [postId, String(days)]);
  const searchPosts = (q, user, extra = '') =>
    request(app).get(`/search/posts?q=${encodeURIComponent(q)}${extra}`).set(user ? auth(user) : {});
  const contents = (res) => res.body.posts.map((p) => p.content);

  describe('people', () => {
    it('exact name, then names starting with it, then people you follow, then shorter names', async () => {
      const viewer = await registerAndLogin(app, { username: 'viewer_one' });
      await registerAndLogin(app, { username: 'aye_mya' });
      const followed = await registerAndLogin(app, { username: 'zaw_mya_htun' });
      await registerAndLogin(app, { username: 'mya_long_name' });
      await registerAndLogin(app, { username: 'myanmar' });
      await registerAndLogin(app, { username: 'mya' });
      await request(app).post(`/users/${followed.id}/follow`).set(auth(viewer));

      const res = await request(app).get('/search/users?q=MYA').set(auth(viewer));
      expect(res.status).toBe(200);
      expect(res.body.map((u) => u.username)).toEqual(['mya', 'myanmar', 'mya_long_name', 'zaw_mya_htun', 'aye_mya']);
      expect(res.body.find((u) => u.username === 'zaw_mya_htun').is_following).toBe(true);
      expect(res.body.find((u) => u.username === 'aye_mya').is_following).toBe(false);
    });

    it('treats % and _ as plain characters', async () => {
      await registerAndLogin(app, { username: 'plainname' });
      await registerAndLogin(app, { username: 'under_score' });
      expect((await request(app).get('/search/users?q=%25')).body).toEqual([]);
      const underscore = (await request(app).get('/search/users?q=r_s')).body.map((u) => u.username);
      expect(underscore).toEqual(['under_score']);
    });
  });

  describe('posts', () => {
    it('finds other forms of an English word ("runs" finds "running")', async () => {
      const author = await registerAndLogin(app);
      await post(author, 'I love running every morning');
      await post(author, 'Unrelated words');
      expect(contents(await searchPosts('runs'))).toEqual(['I love running every morning']);
    });

    it('finds Burmese text inside a longer run of letters (no spaces between words)', async () => {
      const author = await registerAndLogin(app);
      await post(author, 'မင်္ဂလာပါ ရန်ကုန်မြို့ကနေ');
      await post(author, 'မန္တလေး');
      expect(contents(await searchPosts('ရန်ကုန်'))).toEqual(['မင်္ဂလာပါ ရန်ကုန်မြို့ကနေ']);
    });

    it('supports web-search syntax: a minus leaves a word out', async () => {
      const author = await registerAndLogin(app);
      await post(author, 'green tea');
      await post(author, 'tea and coffee');
      expect(contents(await searchPosts('tea -coffee'))).toEqual(['green tea']);
    });

    it('treats % as a plain character', async () => {
      const author = await registerAndLogin(app);
      await post(author, '100% sure');
      await post(author, 'plain post');
      expect(contents(await searchPosts('%'))).toEqual(['100% sure']);
    });

    it('the whole query as typed beats the same words scattered', async () => {
      const author = await registerAndLogin(app);
      await post(author, 'new tea shop opened downtown');
      await post(author, 'the shop downtown sells good tea');
      expect(contents(await searchPosts('tea shop'))).toEqual(['new tea shop opened downtown', 'the shop downtown sells good tea']);
    });

    it('the word as typed beats another form of it', async () => {
      const author = await registerAndLogin(app);
      // The exact match is the older post: without the bonus the two tie
      // and the newer one would come first.
      await post(author, 'she runs the tea shop');
      await post(author, 'running the tea shop');
      expect(contents(await searchPosts('runs'))).toEqual(['she runs the tea shop', 'running the tea shop']);
    });

    it('among equal matches, more engagement ranks higher', async () => {
      const author = await registerAndLogin(app);
      const fans = [await registerAndLogin(app), await registerAndLogin(app)];
      const popular = await post(author, 'mohinga breakfast spot');
      await post(author, 'mohinga breakfast spot');
      for (const fan of fans) await like(fan, popular);
      const res = await searchPosts('mohinga');
      expect(res.body.posts.map((p) => p.id)[0]).toBe(popular.id);
    });

    it('among equal matches, a fresh post beats a months-old one', async () => {
      const author = await registerAndLogin(app);
      const fresh = await post(author, 'thingyan water festival');
      const old = await post(author, 'thingyan water festival');
      await ageDays(old.id, 90);
      expect((await searchPosts('thingyan')).body.posts.map((p) => p.id)).toEqual([fresh.id, old.id]);
    });

    it('keeps visibility: followers-only posts for followers, blocks hide authors', async () => {
      const author = await registerAndLogin(app);
      const follower = await registerAndLogin(app);
      const stranger = await registerAndLogin(app);
      await request(app).post(`/users/${author.id}/follow`).set(auth(follower));
      await post(author, 'secret pagoda', 'followers');
      await post(author, 'public pagoda');
      expect(contents(await searchPosts('pagoda', follower)).sort()).toEqual(['public pagoda', 'secret pagoda']);
      expect(contents(await searchPosts('pagoda', stranger))).toEqual(['public pagoda']);
      await request(app).post(`/users/${author.id}/block`).set(auth(stranger));
      expect(contents(await searchPosts('pagoda', stranger))).toEqual([]);
    });

    it(`ranks only the newest ${SEARCH_CANDIDATES} matches (a bounded read) and pages them`, async () => {
      const author = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const oldest = await post(author, 'bagan sunrise, the best one');
      await like(fan, oldest);
      await pool.query(
        "INSERT INTO posts (user_id, content) SELECT $1, 'bagan sunrise ' || g FROM generate_series(1, $2) g",
        [author.id, SEARCH_CANDIDATES]
      );
      const seen = [];
      let page = 1;
      let res;
      do {
        res = await searchPosts('bagan', null, `&limit=50&page=${page}`);
        seen.push(...res.body.posts.map((p) => p.id));
        page += 1;
      } while (res.body.hasMore && page < 20);
      expect(seen).toHaveLength(SEARCH_CANDIDATES);
      expect(new Set(seen).size).toBe(SEARCH_CANDIDATES);
      expect(seen).not.toContain(oldest.id);
    });
  });
});
