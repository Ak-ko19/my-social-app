const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');

// Day 10 step 2: GET /health, structured logging, request log, and no stray
// console calls left in the backend.
describe('monitoring', () => {
  const { app } = setupTestApp();
  const db = require('../../db');
  const logger = require('../../utils/logger');
  const requestLogger = require('../../middleware/requestLogger');

  let out;
  let err;
  beforeEach(() => {
    out = jest.spyOn(console, 'log').mockImplementation(() => {});
    err = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('GET /health', () => {
    it('is ok when the database answers', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', db: 'ok', uptimeSeconds: expect.any(Number) });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is 503 when the database fails, without saying why', async () => {
      jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('password authentication failed for user "neondb_owner" at ep-secret-host.neon.tech'));
      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'error', db: 'down' });
      expect(res.text).not.toMatch(/neon|password/);
      expect(err.mock.calls.flat().join(' ')).toMatch(/database unreachable[\s\S]*password authentication failed/); // but it IS logged
    });

    it('does not hang when the database does not answer (3 s timeout)', async () => {
      jest.spyOn(db, 'query').mockImplementationOnce(() => new Promise(() => {}));
      const started = Date.now();
      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(Date.now() - started).toBeLessThan(5000);
    }, 10000);

    it('replaces the old debug endpoint', async () => {
      expect((await request(app).get('/test-db')).status).toBe(404);
    });
  });

  describe('logger', () => {
    const withEnv = (env, fn) => {
      const saved = { NODE_ENV: process.env.NODE_ENV, RENDER: process.env.RENDER };
      Object.assign(process.env, env);
      try { return fn(); } finally { Object.assign(process.env, saved); if (saved.RENDER === undefined) delete process.env.RENDER; }
    };

    it('writes one JSON line per event in production', () => {
      withEnv({ RENDER: 'true' }, () => {
        logger.info('server started', { port: 3000 });
        const pgError = Object.assign(new Error('duplicate key value'), { code: '23505', detail: 'Key (email)=(ana@example.com) already exists.' });
        logger.error('request failed', { route: 'POST /signup', err: pgError });
      });
      const info = JSON.parse(out.mock.calls[0][0]);
      expect(info).toEqual({ level: 'info', time: expect.any(String), msg: 'server started', port: 3000 });
      expect(new Date(info.time).toString()).not.toBe('Invalid Date');
      const line = err.mock.calls[0][0];
      const entry = JSON.parse(line);
      expect(entry).toMatchObject({ level: 'error', msg: 'request failed', route: 'POST /signup', err: { name: 'Error', message: 'duplicate key value', code: '23505' } });
      expect(entry.err.stack).toMatch(/at /);
      expect(line).not.toContain('ana@example.com'); // pg `detail` carries row values: never logged
    });

    it('writes readable lines in development, to the right stream', () => {
      withEnv({ NODE_ENV: 'development', RENDER: '' }, () => {
        logger.info('hello', { a: 1 });
        logger.error('broke', { err: new Error('boom') });
      });
      expect(out.mock.calls[0][0]).toBe('[info] hello {"a":1}');
      expect(err.mock.calls[0][0]).toMatch(/^\[error\] broke\n {2}Error: boom\n {4}at /);
    });

    it('copes with non-Error values', () => {
      withEnv({ RENDER: 'true' }, () => logger.error('odd', { err: 'just a string' }));
      expect(JSON.parse(err.mock.calls[0][0]).err).toEqual({ message: 'just a string' });
    });
  });

  describe('request log', () => {
    function appWithLogger() {
      const a = express();
      a.use(requestLogger);
      a.get('/', (req, res) => res.send('home'));
      a.get('/health', (req, res) => res.send('ok'));
      a.get('/posts/:id', (req, res) => { req.userId = 7; res.send('post'); });
      a.get('/boom', (req, res) => res.status(500).send('x'));
      return a;
    }

    it('logs one line per request with the route pattern, status, time and ids', async () => {
      // An id and token that can't turn up by chance in the line's random
      // request id, timestamp or duration (Day 55: "123" could, now and then).
      const res = await request(appWithLogger()).get('/posts/987654321?token=sekrit-token-value');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      const line = out.mock.calls.map((c) => c[0]).find((l) => l.includes('request'));
      expect(line).toMatch(/"route":"\/posts\/:id"/);
      expect(line).toMatch(/"status":200/);
      expect(line).toMatch(/"ms":\d+/);
      expect(line).toMatch(/"userId":7/);
      expect(line).toContain(res.headers['x-request-id']);
      expect(line).not.toMatch(/987654321|sekrit-token-value/); // the pattern, never the concrete URL
    });

    it('reuses a safe incoming X-Request-Id, replaces an unsafe one', async () => {
      const a = appWithLogger();
      expect((await request(a).get('/posts/1').set('X-Request-Id', 'abc-123_XYZ.42')).headers['x-request-id']).toBe('abc-123_XYZ.42');
      const bad = (await request(a).get('/posts/1').set('X-Request-Id', '<script>alert(1)</script>')).headers['x-request-id'];
      expect(bad).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('uses error level for 5xx and skips keep-alive/monitor pings', async () => {
      const a = appWithLogger();
      await request(a).get('/');
      await request(a).get('/health');
      expect(out).not.toHaveBeenCalled();
      await request(a).get('/boom');
      expect(err.mock.calls[0][0]).toMatch(/\[error\] request .*"status":500/);
    });
  });

  // Found while verifying Day 10: a dropped idle database connection (Neon
  // suspending, a restart) emitted an unhandled 'error' and crashed the
  // whole server. The real db.js (not the test mock) must survive it.
  it('a dropped idle database connection is logged, not a crash', () => {
    const pool = jest.requireActual('../../db');
    expect(pool.listenerCount('error')).toBeGreaterThanOrEqual(1);
    expect(() => pool.emit('error', new Error('terminating connection due to administrator command'))).not.toThrow();
    expect(err.mock.calls.flat().join(' ')).toMatch(/database connection lost[\s\S]*terminating connection/);
  });

  it('no backend source calls console.* except the logger', () => {
    const root = path.join(__dirname, '../..');
    const offenders = [];
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        if (['node_modules', 'tests', 'scripts', 'coverage'].includes(name)) continue;
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.js') && full !== path.join(root, 'utils', 'logger.js')) {
          fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
            if (/\bconsole\.(log|error|warn|info|debug)\(/.test(line)) offenders.push(`${path.relative(root, full)}:${i + 1}`);
          });
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
