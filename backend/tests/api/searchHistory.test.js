const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 42: recent searches -- POST/GET/DELETE /search/history.
describe('search history (Day 42)', () => {
  const { app, reset } = setupTestApp();
  // After setupTestApp, so the controller gets the mocked db.
  const { HISTORY_LIMIT } = require('../../controllers/searchHistoryController');
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const save = (user, query) => request(app).post('/search/history').set(auth(user)).send({ query });
  const list = async (user) => (await request(app).get('/search/history').set(auth(user))).body;
  const queries = async (user) => (await list(user)).map((s) => s.query);

  it('saves searches newest first; the same search again (any case) moves to the top', async () => {
    const me = await registerAndLogin(app);
    expect((await save(me, '  mohinga ')).status).toBe(204);
    await save(me, 'tea shop');
    await save(me, 'bagan');
    await save(me, 'Tea Shop');
    expect(await queries(me)).toEqual(['Tea Shop', 'bagan', 'mohinga']);
  });

  it('keeps only the newest 20', async () => {
    const me = await registerAndLogin(app);
    for (let i = 1; i <= HISTORY_LIMIT + 2; i++) await save(me, `search ${i}`);
    const kept = await queries(me);
    expect(kept).toHaveLength(HISTORY_LIMIT);
    expect(kept[0]).toBe(`search ${HISTORY_LIMIT + 2}`);
    expect(kept).not.toContain('search 1');
    expect(kept).not.toContain('search 2');
    const stored = await pool.query('SELECT count(*)::int AS n FROM search_history WHERE user_id = $1', [me.id]);
    expect(stored.rows[0].n).toBe(HISTORY_LIMIT);
  });

  it('is private: others see only their own and cannot delete yours', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    await save(me, 'my secret search');
    await save(other, 'their search');
    expect(await queries(other)).toEqual(['their search']);
    const [mine] = await list(me);
    expect((await request(app).delete(`/search/history/${mine.id}`).set(auth(other))).status).toBe(404);
    expect(await queries(me)).toEqual(['my secret search']);
  });

  it('removes one, or clears them all', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    await save(me, 'one');
    await save(me, 'two');
    await save(other, 'kept');
    const [two] = await list(me);
    expect((await request(app).delete(`/search/history/${two.id}`).set(auth(me))).status).toBe(204);
    expect(await queries(me)).toEqual(['one']);
    expect((await request(app).delete('/search/history').set(auth(me))).status).toBe(204);
    expect(await queries(me)).toEqual([]);
    expect(await queries(other)).toEqual(['kept']);
  });

  it('rejects empty, too long and missing queries, bad ids, and visitors', async () => {
    const me = await registerAndLogin(app);
    expect((await save(me, '   ')).status).toBe(400);
    expect((await save(me, 'x'.repeat(101))).status).toBe(400);
    expect((await save(me, 'x'.repeat(100))).status).toBe(204);
    expect((await request(app).post('/search/history').set(auth(me)).send({})).status).toBe(400);
    expect((await request(app).delete('/search/history/abc').set(auth(me))).status).toBe(400);
    expect((await request(app).get('/search/history')).status).toBe(401);
    expect((await request(app).post('/search/history').send({ query: 'x' })).status).toBe(401);
  });

  it('is in the data download and goes with the account', async () => {
    const me = await registerAndLogin(app);
    await save(me, 'thingyan');
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(me))).text);
    expect(data.recent_searches).toEqual([expect.objectContaining({ query: 'thingyan' })]);
    await request(app).delete('/profile').set(auth(me)).send({ password: me.password });
    const left = await pool.query('SELECT count(*)::int AS n FROM search_history WHERE user_id = $1', [me.id]);
    expect(left.rows[0].n).toBe(0);
  });
});
