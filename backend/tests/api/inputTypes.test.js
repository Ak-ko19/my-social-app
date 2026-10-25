const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { build } = require('../../docs/openapi');

// Day 75 (security round 2): a field of the wrong type is the client's
// mistake, never a server error. Sweeps every documented route (so a new one
// is covered once it is in the spec): each JSON body field sent as an object
// and as an array, and each query parameter sent twice. Found 500s on
// signup, login, forgot-password, deactivate, delete account, reports and
// search before the fixes (utils/bodyText.js, server.js 'query parser').
const spec = build();
const operations = Object.entries(spec.paths).flatMap(([path, ops]) => Object.entries(ops).map(([method, op]) => ({ path, method, op })));
// Push is off in tests: its routes answer 503 before reading the body.
const PUSH_OFF = (o, res) => o.path.startsWith('/push/') && res.status === 503;

describe('fields of the wrong type', () => {
  const { app, reset } = setupTestApp();
  let auth;
  let url;
  beforeAll(async () => {
    await reset();
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    auth = { Authorization: `Bearer ${a.token}` };
    // Real ids the caller can reach, so requests get past "not found".
    const post = (await request(app).post('/posts').set(auth).field('content', 'x')).body;
    const conv = (await request(app).post('/conversations').set(auth).send({ userId: b.id })).body;
    const ids = { id: post.id, userId: b.id, followerId: b.id };
    url = (path) => path.replace(/\{(\w+)\}/g, (_, name) => String(ids[name] ?? 1)).replace(/^\/conversations\/\d+/, `/conversations/${conv.id}`);
  });

  it('a JSON body field that is an object or an array is never a 5xx', async () => {
    const bad = [];
    for (const o of operations) {
      const schema = o.op.requestBody?.content?.['application/json']?.schema;
      if (!schema?.properties || o.op['x-auth'] === 'secret') continue;
      for (const field of Object.keys(schema.properties)) {
        for (const value of [{ a: 1 }, ['x', 'y']]) {
          const res = await request(app)[o.method](url(o.path)).set(auth).send({ [field]: value });
          if (res.status >= 500 && !PUSH_OFF(o, res)) bad.push(`${res.status} ${o.method.toUpperCase()} ${o.path} ${field}=${JSON.stringify(value)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('a query parameter sent twice is never a 5xx', async () => {
    const bad = [];
    for (const o of operations.filter((x) => x.method === 'get')) {
      const names = (o.op.parameters || []).filter((p) => p.in === 'query').map((p) => p.name);
      if (!names.length) continue;
      const target = `${url(o.path)}?${names.map((n) => `${n}=1&${n}=2`).join('&')}`;
      const res = await request(app).get(target).set(auth);
      if (res.status >= 500) bad.push(`${res.status} GET ${target}`);
    }
    expect(bad).toEqual([]);
  });

  // Day 85: an id in the path that is not a plain whole number -- part of
  // one, negative, written as a power, too big for the database, or in
  // hex -- is the client's mistake: 400 or 404, never a 5xx. ("1.5" passed
  // isNaN and then failed in the query.)
  it('an id in the path that is not a plain whole number is never a 5xx', async () => {
    const bad = [];
    for (const o of operations) {
      if (o.op['x-auth'] === 'secret') continue;
      const ints = (o.op.parameters || []).filter((p) => p.in === 'path' && p.schema?.type === 'integer').map((p) => p.name);
      for (const name of ints) {
        for (const value of ['1.5', '-1', '1e3', '99999999999', '0x10']) {
          const target = url(o.path.replace(`{${name}}`, value));
          const res = await request(app)[o.method](target).set(auth).send({});
          if (res.status >= 500 && !PUSH_OFF(o, res)) bad.push(`${res.status} ${o.method.toUpperCase()} ${o.path} ${name}=${value}`);
        }
      }
    }
    expect(bad).toEqual([]);
  }, 180000);
});
