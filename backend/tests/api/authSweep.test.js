const request = require('supertest');
const jwt = require('jsonwebtoken');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { build } = require('../../docs/openapi');

// Day 75 (security round 2): every operation the API reference marks as
// needing a login refuses a request without a good one -- no token, a token
// signed with another secret, and a real token whose session was logged out
// -- and admin-only ones answer 404 to everyone else. The spec lists every
// route (openapiSpec.test checks that), so a new route is covered as soon
// as it is documented. Path ids are placeholders: the login check comes
// before anything reads them.
const spec = build();
const operations = Object.entries(spec.paths).flatMap(([path, ops]) => Object.entries(ops).map(([method, o]) => ({
  method,
  path,
  url: path.replace(/\{[^}]+\}/g, '1'),
  auth: o['x-auth']
})));
const of = (...kinds) => operations.filter((o) => kinds.includes(o.auth));
const call = (app, o, token) => {
  const req = request(app)[o.method](o.url);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

describe('login checks on every documented route', () => {
  const { app, reset } = setupTestApp();
  let user;
  let loggedOut;
  beforeAll(async () => {
    await reset();
    user = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    expect((await request(app).post('/logout').set('Authorization', `Bearer ${other.token}`)).status).toBe(200);
    loggedOut = other.token;
  });

  it('covers the whole API', () => {
    expect(of('user', 'admin').length).toBeGreaterThan(150);
  });

  it('refuses no token, a forged token and a logged-out session (401) wherever a login is needed', async () => {
    const forged = jwt.sign({ userId: user.id, sid: 'x' }, 'not-the-server-secret', { expiresIn: 3600 });
    const wrong = [];
    for (const o of of('user', 'admin')) {
      for (const [what, token] of [['no token', null], ['forged', forged], ['logged out', loggedOut]]) {
        const res = await call(app, o, token);
        if (res.status !== 401) wrong.push(`${o.method.toUpperCase()} ${o.path} (${what}): ${res.status}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('answers 404 to a logged-in non-admin on every admin route', async () => {
    const wrong = [];
    for (const o of of('admin')) {
      const res = await call(app, o, user.token);
      if (res.status !== 404) wrong.push(`${o.method.toUpperCase()} ${o.path}: ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it('treats a bad token as logged out (never 401) where a login is optional', async () => {
    const wrong = [];
    for (const o of of('optional')) {
      const res = await call(app, o, 'not-a-token');
      if (res.status === 401 || res.status >= 500) wrong.push(`${o.method.toUpperCase()} ${o.path}: ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });
});
