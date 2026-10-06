const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 40 (audit N3): GET /explore/hashtags shares one cached list among
// visitors and viewers with no blocks; viewers with blocks get it live.
describe('trending hashtags cache (Day 40)', () => {
  const { app, reset } = setupTestApp();
  // After setupTestApp, so these get the mocked db.
  const db = require('../../db');
  const { clearTrendingCache, TRENDING_TTL_MS } = require('../../controllers/exploreController');

  beforeAll(() => { process.env.TRENDING_CACHE_MS = String(TRENDING_TTL_MS); });
  afterAll(() => { delete process.env.TRENDING_CACHE_MS; });
  beforeEach(async () => {
    await reset();
    clearTrendingCache();
    jest.restoreAllMocks();
  });

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = (user, content) => request(app).post('/posts').set(auth(user)).field('content', content).then((r) => r.body);
  const trending = (user) => request(app).get('/explore/hashtags').set(user ? auth(user) : {});
  const tags = (res) => res.body.map((t) => t.tag);
  const trendingQueries = (spy) => spy.mock.calls.filter(([sql]) => sql.includes('FROM post_hashtags')).length;

  it('visitors and viewers without blocks share the cached list until it expires', async () => {
    const author = await registerAndLogin(app);
    const viewer = await registerAndLogin(app);
    await post(author, '#first');
    expect(tags(await trending(null))).toEqual(['first']);

    await post(author, '#second');
    const spy = jest.spyOn(db, 'query');
    expect(tags(await trending(null))).toEqual(['first']);
    expect(tags(await trending(viewer))).toEqual(['first']);
    expect(trendingQueries(spy)).toBe(0);

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + TRENDING_TTL_MS + 1);
    expect(tags(await trending(viewer))).toEqual(['second', 'first']); // a tie: newest first
    expect(trendingQueries(spy)).toBe(1);
  });

  it('a viewer with a block (either direction) gets an exact, live list', async () => {
    const author = await registerAndLogin(app);
    const blocker = await registerAndLogin(app);
    const blockedViewer = await registerAndLogin(app);
    await post(author, '#fromauthor');
    expect(tags(await trending(null))).toEqual(['fromauthor']); // now cached

    await request(app).post(`/users/${author.id}/block`).set(auth(blocker));
    await request(app).post(`/users/${blockedViewer.id}/block`).set(auth(author));
    await post(blocker, '#fresh');
    expect(tags(await trending(blocker))).toEqual(['fresh']);
    expect(tags(await trending(blockedViewer))).toEqual(['fresh']);
    expect(tags(await trending(null))).toEqual(['fromauthor']); // still the cached one
  });

  it('requests that miss together share one query', async () => {
    const author = await registerAndLogin(app);
    await post(author, '#together');
    const spy = jest.spyOn(db, 'query');
    const all = await Promise.all([trending(null), trending(null), trending(null)]);
    expect(all.map(tags)).toEqual([['together'], ['together'], ['together']]);
    expect(trendingQueries(spy)).toBe(1);
  });

  it('a failed query is not cached', async () => {
    const author = await registerAndLogin(app);
    await post(author, '#retry');
    const spy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('connection lost'));
    expect((await trending(null)).status).toBe(500);
    spy.mockRestore();
    expect(tags(await trending(null))).toEqual(['retry']);
  });
});
