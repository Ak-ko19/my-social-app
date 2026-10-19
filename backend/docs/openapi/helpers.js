// Day 67: small builders for the OpenAPI spec, so ~190 operations stay
// short and alike. An area file (areas/*.js) lists its operations as
//   'GET /posts/:id': op({ tag, summary, auth, query, body, responses })
// with Express-style paths (the same strings as routes/*.js); index.js turns
// them into OpenAPI paths. tests/api/openapiSpec.test.js checks every one
// against the real router, and tests/helpers/contract.js checks the API
// tests' real responses against them.

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

// Schema shorthands.
const s = {
  int: (description, extra = {}) => ({ type: 'integer', ...(description && { description }), ...extra }),
  id: (description) => ({ type: 'integer', minimum: 1, ...(description && { description }) }),
  str: (description, extra = {}) => ({ type: 'string', ...(description && { description }), ...extra }),
  bool: (description) => ({ type: 'boolean', ...(description && { description }) }),
  time: (description) => ({ type: 'string', format: 'date-time', ...(description && { description }) }),
  enum: (values, description) => ({ type: 'string', enum: values, ...(description && { description }) }),
  array: (items, description) => ({ type: 'array', items, ...(description && { description }) }),
  // null allowed too (a nullable column).
  nullable: (schema) => (schema.$ref
    ? { oneOf: [schema, { type: 'null' }] }
    : { ...schema, type: [schema.type, 'null'], ...(schema.enum && { enum: [...schema.enum, null] }) }),
  // An object: every listed property is required unless it's in `optional`.
  object: (properties, { optional = [], description, extra = true } = {}) => ({
    type: 'object',
    ...(description && { description }),
    properties,
    required: Object.keys(properties).filter((key) => !optional.includes(key)),
    // Responses may carry more fields than documented (additive changes
    // aren't breaking); request bodies are written with extra: false.
    additionalProperties: extra
  }),
  ref
};

// Request bodies: every field optional unless listed in `required`;
// optional: true when the body itself may be left out.
const body = (properties, { required = [], description, optional = false } = {}) => ({
  ...(description && { description }),
  required: !optional,
  content: {
    'application/json': {
      schema: { type: 'object', properties, required, additionalProperties: true }
    }
  }
});
const multipart = (properties, { required = [], description } = {}) => ({
  ...(description && { description }),
  required: true,
  content: {
    'multipart/form-data': {
      schema: { type: 'object', properties, required }
    }
  }
});
// A file field in a multipart body.
const file = (description) => ({ type: 'string', format: 'binary', description });

// Responses.
const json = (schema, description) => ({ description, content: { 'application/json': { schema } } });
// Errors and short confirmations are plain text across this API.
const text = (description) => ({ description, content: { 'text/plain': { schema: { type: 'string' } } } });
const html = (description) => ({ description, content: { 'text/html': { schema: { type: 'string' } } } });
const empty = (description) => ({ description });

const AUTH = {
  // Logged in: Authorization: Bearer <token from POST /login>.
  user: { security: [{ bearerAuth: [] }] },
  // Works logged out too; a valid token adds viewer-specific fields and
  // lets you see what your account may see. A bad token counts as logged out.
  optional: { security: [{}, { bearerAuth: [] }] },
  // Logged in as an admin; anyone else gets 404 (the route isn't advertised).
  admin: { security: [{ bearerAuth: [] }], 'x-admin-only': true },
  public: { security: [] },
  // Machines only: Authorization: Bearer <CLEANUP_SECRET>.
  secret: { security: [{ cleanupSecret: [] }] }
};

// One operation. auth is required (it is checked against the route's
// middleware). `limited`: the route has its own rate limit (429 +
// Retry-After). `pathParams` overrides the default integer id schema.
function op({ tag, summary, description, auth, query = {}, pathParams = {}, requestBody, responses, limited = false }) {
  if (!AUTH[auth]) throw new Error(`op "${summary}": unknown auth "${auth}"`);
  if (!tag || !summary || !responses) throw new Error(`op "${summary}": tag, summary and responses are required`);
  const shared = {};
  if (auth === 'user' || auth === 'admin') shared[401] = { $ref: '#/components/responses/Unauthorized' };
  if (auth === 'admin') shared[404] = { $ref: '#/components/responses/NotFound' };
  if (limited) shared[429] = { $ref: '#/components/responses/TooManyRequests' };
  shared[500] = { $ref: '#/components/responses/ServerError' };
  return {
    tags: [tag],
    summary,
    ...(description && { description }),
    ...AUTH[auth],
    'x-auth': auth,
    'x-query': query,
    'x-path-params': pathParams,
    ...(requestBody && { requestBody }),
    responses: { ...responses, ...Object.fromEntries(Object.entries(shared).filter(([code]) => !responses[code])) }
  };
}

// Query parameter shorthand: q(schema) optional, q(schema, true) required.
const q = (schema, required = false) => ({ schema, required });

// The two pagination styles (utils/pagination.js, utils/cursorPagination.js).
// Bad values are never refused: anything below 1 or not a number falls back
// to the default, and a limit above the maximum is capped.
const pageQuery = ({ defaultLimit = 10, maxLimit = 50 } = {}) => ({
  page: q(s.int('Page number, from 1', { default: 1 })),
  limit: q(s.int(`Items per page (at most ${maxLimit})`, { default: defaultLimit }))
});
const cursorQuery = ({ defaultLimit = 20, maxLimit = 100 } = {}) => ({
  cursor: q(s.str('`nextCursor` from the previous page; omit for the first page')),
  limit: q(s.int(`Items per page (at most ${maxLimit})`, { default: defaultLimit }))
});

module.exports = { s, ref, body, multipart, file, json, text, html, empty, op, q, pageQuery, cursorQuery };
