const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { setupTestApp } = require('../helpers/setupTestApp');
const { build, toOpenApiPath } = require('../../docs/openapi');

// Day 67: the API spec (docs/openapi) against the real Express router, both
// ways, so it can't drift: every route is documented and every documented
// operation exists; each one's auth is the auth its middleware really
// applies; upload routes take multipart/form-data; path parameters match;
// every $ref resolves. (helpers/contract.js checks the responses.)
describe('API spec (docs/openapi)', () => {
  const { app } = setupTestApp();
  const spec = build();
  const ROUTES_DIR = path.join(__dirname, '../../routes');

  // Route files whose operations are still being written up (Days 67-68);
  // this list only shrinks, and is gone once every area is documented.
  const PENDING = new Set(['adminRoutes', 'communityRoutes', 'pageRoutes', 'reportRoutes']);

  // Every route the app serves: method, Express path, its route file (null
  // for the few in server.js) and its middleware's names.
  const fileOf = new Map(fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'))
    .map((f) => [require(path.join(ROUTES_DIR, f)), f.replace(/\.js$/, '')]));
  const routes = [];
  for (const layer of app.router.stack) {
    const add = (route, file) => {
      for (const method of Object.keys(route.methods)) {
        routes.push({ method: method.toUpperCase(), path: route.path, file, names: route.stack.map((l) => l.handle.name) });
      }
    };
    if (layer.route) add(layer.route, null);
    else if (fileOf.has(layer.handle)) for (const inner of layer.handle.stack) if (inner.route) add(inner.route, fileOf.get(layer.handle));
  }
  const operations = Object.entries(spec.paths).flatMap(([p, ops]) => Object.entries(ops).map(([verb, op]) => ({ key: `${verb.toUpperCase()} ${p}`, op })));
  const opOf = (route) => spec.paths[toOpenApiPath(route.path)]?.[route.method.toLowerCase()];
  const label = (route) => `${route.method} ${route.path}`;

  // What the middleware really requires.
  const authOf = ({ names }) => {
    if (names.includes('requireAdmin')) return 'admin';
    if (names.includes('authMiddleware')) return 'user';
    if (names.includes('optionalAuth')) return 'optional';
    if (names.includes('sharedSecret')) return 'secret';
    return 'public';
  };
  const UPLOADS = ['multerMiddleware', 'uploadPostImages'];

  it('found the routes (sanity: the walk sees the whole app)', () => {
    expect(routes.length).toBeGreaterThan(180);
    expect(routes.filter((r) => r.file === null).map(label)).toEqual(['GET /']);
  });

  it('documents every route (apart from the files still PENDING)', () => {
    const missing = routes.filter((r) => !PENDING.has(r.file) && !opOf(r)).map(label);
    expect(missing).toEqual([]);
  });

  it('PENDING only lists files that still have undocumented routes', () => {
    const stillPending = new Set(routes.filter((r) => !opOf(r)).map((r) => r.file));
    expect([...PENDING].filter((file) => !stillPending.has(file))).toEqual([]);
  });

  it('every documented operation exists in the app', () => {
    const served = new Set(routes.map((r) => `${r.method} ${toOpenApiPath(r.path)}`));
    expect(operations.map((o) => o.key).filter((key) => !served.has(key))).toEqual([]);
  });

  it("each operation's auth is what its middleware applies", () => {
    const wrong = routes.filter(opOf).filter((r) => opOf(r)['x-auth'] !== authOf(r))
      .map((r) => `${label(r)}: documented ${opOf(r)['x-auth']}, middleware says ${authOf(r)}`);
    expect(wrong).toEqual([]);
  });

  it('upload routes take multipart/form-data, and only they do', () => {
    const wrong = routes.filter(opOf).filter((r) => {
      const multipart = Boolean(opOf(r).requestBody?.content?.['multipart/form-data']);
      return multipart !== r.names.some((n) => UPLOADS.includes(n));
    }).map(label);
    expect(wrong).toEqual([]);
  });

  it('every path parameter is described, as a required path parameter', () => {
    const wrong = operations.filter(({ key, op }) => {
      const inPath = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const described = (op.parameters || []).filter((p) => p.in === 'path');
      return described.length !== inPath.length || described.some((p) => !inPath.includes(p.name) || !p.required);
    }).map((o) => o.key);
    expect(wrong).toEqual([]);
  });

  it('every operation has a summary and a known tag; every tag is used; operationIds are unique', () => {
    const tags = spec.tags.map((t) => t.name);
    expect(operations.filter(({ op }) => !op.summary || op.tags.length !== 1 || !tags.includes(op.tags[0])).map((o) => o.key)).toEqual([]);
    expect(tags.filter((t) => !operations.some(({ op }) => op.tags[0] === t))).toEqual([]);
    const ids = operations.map(({ op }) => op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every response schema compiles and every $ref resolves', () => {
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    ajv.addFormat('binary', true);
    ajv.addSchema(spec, 'spec');
    const refs = JSON.stringify(spec).match(/"\$ref":"[^"]+"/g) || [];
    for (const r of new Set(refs)) {
      const target = JSON.parse(`{${r}}`).$ref;
      const [, kind, name] = target.split('/').slice(1);
      expect(spec.components[kind]?.[name]).toBeDefined();
    }
    const pointer = (k) => k.replace(/~/g, '~0').replace(/\//g, '~1');
    const failed = [];
    for (const [p, ops] of Object.entries(spec.paths)) {
      for (const [verb, op] of Object.entries(ops)) {
        for (const [status, response] of Object.entries(op.responses)) {
          if (!response.content?.['application/json']) continue;
          try {
            ajv.compile({ $ref: `spec#/paths/${pointer(p)}/${verb}/responses/${status}/content/application~1json/schema` });
          } catch (err) {
            failed.push(`${verb.toUpperCase()} ${p} ${status}: ${err.message}`);
          }
        }
      }
    }
    expect(failed).toEqual([]);
  });
});
