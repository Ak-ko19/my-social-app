const request = require('supertest');

// Day 10: built-in error log (error_groups) + admin view + Sentry hook.
const mockSentry = { init: jest.fn(), captureException: jest.fn() };
jest.mock('@sentry/node', () => mockSentry);

const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

describe('error log', () => {
  const { app, reset } = setupTestApp();
  const errorLog = require('../../services/errorLogService');
  // Background writes: wait until every one started so far has finished.
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 30)); // let fire-and-forget calls start
    await errorLog.whenIdle();
  };
  const groups = async () => (await pool.query('SELECT * FROM error_groups ORDER BY first_seen')).rows;
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

  let logged;
  beforeEach(async () => {
    await reset();
    errorLog.resetThrottle();
    mockSentry.init.mockClear();
    mockSentry.captureException.mockClear();
    logged = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  // report() writes in the background: let each test's writes land before
  // the next test resets the database (else they bleed across tests).
  afterEach(async () => {
    jest.restoreAllMocks();
    await settle();
  });

  it('groups errors that differ only in ids and numbers', () => {
    expect(errorLog.normalise('post 41 not found (uuid 3f2a1c9e-0000-4000-8000-000000000000, hex deadbeefdeadbeef00)'))
      .toBe('post <n> not found (uuid <uuid>, hex <hex>)');
    const fp = (route, msg) => errorLog.fingerprintOf('api', route, msg);
    expect(fp('GET /posts/:id', 'post 41 not found')).toBe(fp('GET /posts/:id', 'post 97 not found'));
    expect(fp('GET /posts/:id', 'post 41 not found')).not.toBe(fp('GET /users/:id', 'post 41 not found'));
  });

  it("a route's 500 is recorded with its route pattern, status and user", async () => {
    const hashtagService = require('../../services/hashtagService');
    jest.spyOn(hashtagService, 'syncPostHashtags').mockRejectedValue(new Error('hashtag table is on fire (row 42)'));
    const user = await registerAndLogin(app);
    const res = await request(app).post('/posts').set(auth(user)).field('content', 'hi #tag');
    expect(res.status).toBe(500);
    expect(res.text).toBe('Create post failed. Please try again later.'); // the user still sees only the generic text
    await settle();
    const [group] = await groups();
    expect(group).toMatchObject({ source: 'api', route: 'POST /posts', status: 500, count: 1, last_user_id: user.id, resolved_at: null });
    expect(group.message).toBe('hashtag table is on fire (row 42)');
    expect(group.stack).toMatch(/at /);
  });

  it('counts repeats, but writes at most once per 10 s per error', async () => {
    const realNow = Date.now;
    let now = realNow();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    for (let i = 0; i < 3; i += 1) errorLog.report(new Error(`db timeout after ${i}ms`), { route: 'GET /feed' });
    await settle();
    expect((await groups()).map((g) => g.count)).toEqual([1]); // one write so far
    now += 11 * 1000;
    errorLog.report(new Error('db timeout after 9ms'), { route: 'GET /feed' });
    await settle();
    expect((await groups()).map((g) => g.count)).toEqual([4]); // 1 + 2 held back + this one
  });

  it('a burst that then stops is still fully counted (written when the 10 s are up)', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      for (let i = 0; i < 3; i += 1) errorLog.report(new Error('socket hiccup'), { source: 'socket', route: 'typing' });
      jest.advanceTimersByTime(10 * 1000); // no 4th error ever comes
    } finally {
      jest.useRealTimers();
    }
    await settle();
    expect((await groups()).map((g) => g.count)).toEqual([3]);
  });

  it('a resolved error re-opens when it happens again', async () => {
    errorLog.report(new Error('boom'), { route: 'GET /x' });
    await settle();
    await pool.query('UPDATE error_groups SET resolved_at = now()');
    errorLog.resetThrottle();
    errorLog.report(new Error('boom'), { route: 'GET /x' });
    await settle();
    const [group] = await groups();
    expect(group.resolved_at).toBeNull();
    expect(group.count).toBe(2);
  });

  it('never throws, whatever it is given, even if the database is down', async () => {
    expect(() => errorLog.report(undefined)).not.toThrow();
    expect(() => errorLog.report('a plain string', { source: 'process' })).not.toThrow();
    expect(() => errorLog.report({ weird: true }, { status: 'x', userId: 'y' })).not.toThrow();
    const db = require('../../db');
    jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('connection refused'));
    errorLog.report(new Error('while the db is down'), { route: 'GET /y' });
    await settle();
    expect(logged.mock.calls.flat().join(' ')).toMatch(/could not save an error to the log: connection refused/);
  });

  it('still saves the error when the user it mentions was deleted meanwhile', async () => {
    const user = await registerAndLogin(app);
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    errorLog.report(new Error('after account deletion'), { route: 'GET /z', userId: user.id });
    await settle();
    expect((await groups()).map((g) => [g.message, g.last_user_id])).toEqual([['after account deletion', null]]);
    expect(logged.mock.calls.map((c) => c.join(' ')).filter((line) => /could not save/.test(line))).toEqual([]);
  });

  it('caps what it stores', async () => {
    errorLog.report(Object.assign(new Error('x'.repeat(5000)), { stack: 'y'.repeat(10000) }), { route: 'z'.repeat(1000) });
    await settle();
    const [group] = await groups();
    expect([group.message.length, group.stack.length, group.route.length]).toEqual([500, 4000, 200]);
  });

  it('the global error handler records unexpected errors', async () => {
    const { errorHandler } = require('../../middleware/errorHandler');
    const res = { headersSent: false, status() { return this; }, send() { return this; } };
    errorHandler(new Error('unexpected thing'), { method: 'GET', path: '/a/1', route: { path: '/a/:id' }, baseUrl: '' }, res, () => {});
    await settle();
    expect((await groups())[0]).toMatchObject({ route: 'GET /a/:id', status: 500, message: 'unexpected thing' });
  });

  describe('browser errors', () => {
    it('are recorded without the query string or tokens in the page path', async () => {
      const res = await request(app).post('/client-errors').send({
        kind: 'render',
        message: "Cannot read properties of undefined (reading 'map')",
        stack: 'TypeError: ...\n    at PostCard (PostCard.jsx:12:3)',
        url: `http://localhost:5173/reset-password/${'ab12'.repeat(16)}?email=someone@example.com`
      });
      expect(res.status).toBe(204);
      await settle();
      const [group] = await groups();
      expect(group).toMatchObject({ source: 'client', route: 'render /reset-password/<hex>', status: null });
      expect(JSON.stringify(group)).not.toMatch(/ab12ab12|someone@example.com/);
    });

    it('know who hit them when logged in, and need a message', async () => {
      const user = await registerAndLogin(app);
      await request(app).post('/client-errors').set(auth(user)).send({ message: 'boom', url: '/messages' });
      await settle();
      expect((await groups())[0]).toMatchObject({ last_user_id: user.id, route: 'error /messages' });
      expect((await request(app).post('/client-errors').send({ url: '/' })).status).toBe(400);
      expect((await request(app).post('/client-errors').send({ message: 42 })).status).toBe(400);
    });

    it('are never sent to Sentry (only server errors are)', async () => {
      process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/1';
      try {
        await request(app).post('/client-errors').send({ message: 'boom', url: '/' });
        expect(mockSentry.captureException).not.toHaveBeenCalled();
      } finally {
        process.env.SENTRY_DSN = '';
      }
    });
  });

  describe('Sentry hook', () => {
    afterEach(() => { process.env.SENTRY_DSN = ''; });

    it('stays off (not even loaded) without SENTRY_DSN', () => {
      errorLog.report(new Error('x'));
      errorLog.startMonitoring();
      expect(mockSentry.init).not.toHaveBeenCalled();
      expect(mockSentry.captureException).not.toHaveBeenCalled();
    });

    it('with SENTRY_DSN: initialised once, gets server errors with their route', () => {
      process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/1';
      errorLog.report(new Error('first'), { source: 'socket', route: 'send_message', userId: 7 });
      errorLog.report(new Error('second'), { route: 'GET /feed' });
      expect(mockSentry.init).toHaveBeenCalledTimes(1);
      expect(mockSentry.init.mock.calls[0][0]).toMatchObject({ dsn: 'https://key@o1.ingest.sentry.io/1' });
      expect(mockSentry.captureException).toHaveBeenCalledTimes(2);
      expect(mockSentry.captureException.mock.calls[0][1]).toEqual({ tags: { source: 'socket', route: 'send_message' }, user: { id: '7' } });
    });
  });

  describe('admin view', () => {
    let admin;
    beforeEach(async () => {
      admin = await registerAndLogin(app);
      await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
    });
    const list = async (status = 'open') => (await request(app).get(`/admin/errors?status=${status}`).set(auth(admin))).body;

    it('only admins can see it (404 for everyone else)', async () => {
      const user = await registerAndLogin(app);
      expect((await request(app).get('/admin/errors').set(auth(user))).status).toBe(404);
      expect((await request(app).get('/admin/errors')).status).toBe(401);
    });

    it('lists open errors, most recent first; resolving moves one to the resolved list', async () => {
      errorLog.report(new Error('older'), { route: 'GET /a' });
      await settle();
      errorLog.report(new Error('newer'), { route: 'GET /b' });
      await settle();
      const open = await list();
      expect(open.errors.map((e) => e.message)).toEqual(['newer', 'older']);
      expect(open.errors[0]).toEqual(expect.objectContaining({ source: 'api', route: 'GET /b', count: 1, stack: expect.any(String) }));

      const fp = open.errors[1].fingerprint;
      expect((await request(app).post(`/admin/errors/${fp}/resolve`).set(auth(admin))).status).toBe(200);
      expect((await list()).errors.map((e) => e.message)).toEqual(['newer']);
      expect((await list('resolved')).errors.map((e) => e.message)).toEqual(['older']);
      expect((await request(app).post(`/admin/errors/${fp}/resolve`).set(auth(admin))).status).toBe(404); // already resolved
      expect((await request(app).post(`/admin/errors/${'0'.repeat(40)}/resolve`).set(auth(admin))).status).toBe(404);
    });

    it('pages through a long list', async () => {
      await pool.query(`INSERT INTO error_groups (fingerprint, source, message)
        SELECT lpad(to_hex(g), 40, '0'), 'api', 'error ' || g FROM generate_series(1, 60) g`);
      const first = (await request(app).get('/admin/errors?limit=50').set(auth(admin))).body;
      const second = (await request(app).get('/admin/errors?limit=50&page=2').set(auth(admin))).body;
      expect([first.errors.length, first.hasMore, second.errors.length, second.hasMore]).toEqual([50, true, 10, false]);
    });
  });

  it('the daily cleanup forgets errors nobody has hit for 90 days', async () => {
    await pool.query(`INSERT INTO error_groups (fingerprint, source, message, last_seen) VALUES
      (repeat('a', 40), 'api', 'stale', now() - interval '91 days'),
      (repeat('b', 40), 'api', 'recent', now() - interval '10 days')`);
    const result = await require('../../services/cleanupService').run();
    expect(result.errorGroups).toBe(1);
    expect((await groups()).map((g) => g.message)).toEqual(['recent']);
  });
});
