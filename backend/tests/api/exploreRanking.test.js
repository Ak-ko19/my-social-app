const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 113 (migration 093): Explore reads a ranked list the server keeps,
// rebuilt every EXPLORE_RANKING_MS -- and checks every rule again on each
// read, so what changed since the last rebuild is already right.
describe('Explore ranking', () => {
  const { app, reset } = setupTestApp();
  // Loaded after setupTestApp has pointed the database at the test one.
  const exploreRanking = require('../../services/exploreRankingService');
  beforeEach(reset);
  // As in production: the list is NOT rebuilt on every read.
  beforeAll(() => { process.env.EXPLORE_RANKING_MS = String(60 * 60 * 1000); });
  afterAll(() => { delete process.env.EXPLORE_RANKING_MS; });

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = (user, content, visibility) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    if (visibility) req = req.field('visibility', visibility);
    return req.then((r) => r.body);
  };
  const like = (user, p) => request(app).post(`/posts/${p.id}/like`).set(auth(user));
  const explore = async (user) => {
    const res = await request(app).get('/explore/posts').set(user ? auth(user) : {});
    expect(res.status).toBe(200);
    return res.body.posts.map((p) => p.content);
  };

  it('is built on the first read, then kept until the next rebuild', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await like(fan, await post(author, 'first'));
    expect(await explore(fan)).toEqual(['first']); // never built: built now
    await like(fan, await post(author, 'second'));
    expect(await explore(fan)).toEqual(['first']); // the kept list
    expect(await exploreRanking.refresh()).toEqual({ refreshed: true, posts: 2 });
    expect((await explore(fan)).sort()).toEqual(['first', 'second']);
  });

  it('checks every rule again on each read: what changed since the rebuild is already right', async () => {
    const author = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const viewer = await registerAndLogin(app);
    const audience = await post(author, 'goes followers-only');
    const removed = await post(author, 'gets deleted');
    const blockedOnes = await post(other, 'by someone the viewer blocks');
    for (const p of [audience, removed, blockedOnes]) await like(viewer, p);
    await exploreRanking.refresh();
    expect((await explore(viewer)).sort()).toEqual(['by someone the viewer blocks', 'gets deleted', 'goes followers-only']);

    await request(app).put(`/posts/${audience.id}`).set(auth(author)).send({ content: 'goes followers-only', visibility: 'followers' });
    await request(app).delete(`/posts/${removed.id}`).set(auth(author));
    await request(app).post(`/users/${other.id}/block`).set(auth(viewer));
    expect(await explore(viewer)).toEqual([]);
    // The blocked author's post is still there for everyone else.
    expect(await explore(null)).toEqual(['by someone the viewer blocks']);
  });

  it('an author who goes private, is muted or deactivates leaves Explore at once', async () => {
    const [goesPrivate, muted, leaves, viewer] = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
    for (const [u, text] of [[goesPrivate, 'private soon'], [muted, 'muted soon'], [leaves, 'leaving soon']]) await like(viewer, await post(u, text));
    await exploreRanking.refresh();
    expect((await explore(viewer)).length).toBe(3);
    await request(app).put('/profile/privacy').set(auth(goesPrivate)).send({ isPrivate: true });
    await request(app).post(`/users/${muted.id}/mute`).set(auth(viewer));
    await request(app).post('/profile/deactivate').set(auth(leaves)).send({ password: leaves.password });
    expect(await explore(viewer)).toEqual([]);
    expect(await explore(null)).toEqual(['muted soon']); // muting is the viewer's own choice
  });

  it('only public posts are ranked, and only ones with a reaction or comment', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await post(author, 'nobody reacted');
    for (const visibility of ['followers', 'close_friends', 'only_me']) await like(author, await post(author, `audience ${visibility}`, visibility));
    await like(fan, await post(author, 'public and liked'));
    await exploreRanking.refresh();
    const ranked = (await pool.query('SELECT p.content FROM explore_ranking er JOIN posts p ON p.id = er.post_id')).rows.map((r) => r.content);
    expect(ranked).toEqual(['public and liked']);
  });

  it('after a restart empties the cache (unlogged tables), the next read rebuilds it', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await like(fan, await post(author, 'still popular'));
    await exploreRanking.refresh();
    await pool.query('TRUNCATE explore_ranking, explore_ranking_state');
    expect(await explore(fan)).toEqual(['still popular']);
  });

  it('one rebuild at a time: the ticker leaves a busy one; a reader waits for it and does not rebuild again', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await like(fan, await post(author, 'ranked'));
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query("SELECT pg_advisory_xact_lock(hashtext('mysocialapp explore ranking'))");
      expect(await exploreRanking.refresh()).toEqual({ refreshed: false }); // the ticker's way
      // A reader that finds it stale waits for the rebuild in progress...
      let done = false;
      const reading = exploreRanking.ensureFresh().then(() => { done = true; });
      await new Promise((r) => setTimeout(r, 300));
      expect(done).toBe(false);
      // ...which finishes (the holder plays the other instance's rebuild).
      await holder.query("INSERT INTO explore_ranking_state (id, refreshed_at) VALUES (true, now()) ON CONFLICT (id) DO UPDATE SET refreshed_at = now()");
      await holder.query('COMMIT');
      await reading;
      // It found the list fresh and left it: nothing was ranked again.
      expect(Number((await pool.query('SELECT count(*) FROM explore_ranking')).rows[0].count)).toBe(0);
    } finally {
      holder.release();
    }
  });

  it('the ticker rebuilds only when due', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await like(fan, await post(author, 'due'));
    expect((await exploreRanking.refreshIfDue()).refreshed).toBe(true); // never built
    expect(await exploreRanking.refreshIfDue()).toEqual({ refreshed: false }); // just built
    await pool.query("UPDATE explore_ranking_state SET refreshed_at = now() - interval '2 hours'");
    expect((await exploreRanking.refreshIfDue()).refreshed).toBe(true);
  });
});
