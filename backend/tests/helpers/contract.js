// Day 67: every API test is also a contract test. setupTestApp() installs
// this on the app, so each response the tests see is checked against the
// OpenAPI spec (docs/openapi): its status code must be documented for that
// operation, its content type must be one documented for that status, and a
// JSON body must match the documented schema. A mismatch fails the test file
// (setupTestApp's afterAll), naming the route and what differed.
//
// Only responses from a matched route of a documented operation are checked:
// the app-wide limiter and body parser answer before routing, and
// openapiSpec.test.js is what makes sure every route is documented.
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { build, toOpenApiPath } = require('../../docs/openapi');

let shared = null;
function load() {
  if (!shared) {
    const spec = build();
    // strict: false -- the spec is an OpenAPI document, not only schemas.
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addFormat('binary', true);
    ajv.addSchema(spec, 'spec');
    shared = { spec, ajv, validators: new Map() };
  }
  return shared;
}

const pointer = (key) => key.replace(/~/g, '~0').replace(/\//g, '~1');

// The response object documented for this status, and its JSON pointer
// (a shared one -- { $ref: '#/components/responses/X' } -- is followed).
function documented(spec, path, verb, status) {
  const response = spec.paths[path][verb].responses[status];
  if (!response) return null;
  if (response.$ref) {
    const name = response.$ref.split('/').pop();
    return { response: spec.components.responses[name], at: `#/components/responses/${pointer(name)}` };
  }
  return { response, at: `#/paths/${pointer(path)}/${verb}/responses/${status}` };
}

function validator(at) {
  const { ajv, validators } = load();
  if (!validators.has(at)) validators.set(at, ajv.compile({ $ref: `spec${at}/content/application~1json/schema` }));
  return validators.get(at);
}

// null when the response matches the spec, else what's wrong.
function check(req, res, body) {
  const { spec } = load();
  if (!req.route || req.method === 'HEAD') return null;
  const path = toOpenApiPath(req.route.path);
  const verb = req.method.toLowerCase();
  if (!spec.paths[path]?.[verb]) return null;
  const where = `${req.method} ${req.route.path} -> ${res.statusCode}`;
  const doc = documented(spec, path, verb, res.statusCode);
  if (!doc) return `${where}: this status is not documented`;
  const types = Object.keys(doc.response.content || {});
  const type = (res.get('Content-Type') || '').split(';')[0].trim();
  if (!type) return types.length && res.statusCode !== 204 ? `${where}: sent no body, documented ${types.join(', ')}` : null;
  if (!types.includes(type)) return `${where}: sent ${type}, documented ${types.join(', ') || 'no body'}`;
  if (type === 'application/json' && body !== undefined) {
    const validate = validator(doc.at);
    if (!validate(JSON.parse(JSON.stringify(body)))) {
      return `${where}: body does not match the schema: ${validate.errors.slice(0, 3).map((e) => `${e.instancePath || '(root)'} ${e.message}`).join('; ')}`;
    }
  }
  return null;
}

// Wraps the app so each finished response is checked; mismatches are
// pushed onto `violations` (one entry per distinct problem).
function install(app, violations) {
  const json = app.response.json;
  app.response.json = function contractJson(obj) {
    this.contractBody = obj;
    return json.call(this, obj);
  };
  const handle = app.handle;
  app.handle = function contractHandle(req, res, next) {
    res.on('finish', () => {
      const problem = check(req, res, res.contractBody);
      if (problem && !violations.includes(problem)) violations.push(problem);
    });
    return handle.call(this, req, res, next);
  };
}

module.exports = { install, check };
