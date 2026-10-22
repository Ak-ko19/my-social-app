// Day 67: the OpenAPI 3.1 description of the whole REST API, built from the
// area files. Served as GET /openapi.json with a docs page at GET /docs (see
// routes/docsRoutes.js). Kept honest by tests/api/openapiSpec.test.js (every
// route, its auth, params and uploads, both ways) and by
// tests/helpers/contract.js (every response the API tests see).
const { s } = require('./helpers');
const components = require('./components');

const AREAS = [
  require('./areas/system'),
  require('./areas/auth'),
  require('./areas/people'),
  require('./areas/content'),
  require('./areas/messages'),
  require('./areas/groups')
];

const TAGS = [
  { name: 'System', description: 'Server status, public settings, crash reports, maintenance' },
  { name: 'Auth', description: 'Sign up, log in, passwords, email verification' },
  { name: 'Account', description: 'Your account: password, deactivate, delete' },
  { name: 'Sessions', description: "Where you're logged in; logging out" },
  { name: 'Two-factor', description: 'Two-factor authentication with an authenticator app; recovery codes' },
  { name: 'Links', description: 'Link previews and share cards' },
  { name: 'Push', description: 'Web push notifications' },
  { name: 'Profiles', description: 'Profiles and their settings' },
  { name: 'Following', description: 'Following, follow requests, friends (people who follow each other), suggestions' },
  { name: 'Safety', description: 'Blocking, muting, restricting, close friends, hidden words' },
  { name: 'Search', description: 'Finding people, posts and hashtags; your search history' },
  { name: 'Notifications', description: 'Your notifications and which kinds you get' },
  { name: 'Activity', description: 'What you have reacted to and commented on' },
  { name: 'Posts', description: 'Posts, polls, Home and profile tabs' },
  { name: 'Drafts', description: 'Drafts and scheduled posts' },
  { name: 'Comments', description: 'Comments and replies' },
  { name: 'Reactions', description: 'Reactions on posts' },
  { name: 'Saved', description: 'Saved posts and collections' },
  { name: 'Explore', description: 'Hashtags, trending and popular posts' },
  { name: 'Stories', description: 'Photo stories (24 hours)' },
  { name: 'Events', description: 'Events, and who is going' },
  { name: 'Messages', description: 'Direct and group chats; messages, voice notes and photos' },
  { name: 'Groups', description: 'Groups (communities): members, requests, admins, bans, posts' },
  { name: 'Pages', description: 'Pages: followers, admins, posts' },
  { name: 'Moderation', description: 'Reporting something' },
  { name: 'Admin', description: 'The admin screen (admins only; anyone else gets 404)' }
];

const DESCRIPTION = `The MySocialApp REST API (the web app and, later, the mobile app use the same one).

- **Auth:** log in with \`POST /login\` and send \`Authorization: Bearer <token>\`. Operations marked with a lock need it;
  some work either way (logged out you see what everyone may see).
- **Errors** are plain text (\`text/plain\`) with a short human-readable message in English, unless an operation says
  otherwise. The web app shows its own Arabic translations of these messages.
- **Rate limits:** every route shares a per-client limit, and some have their own; when one is hit the answer is \`429\`
  with \`Retry-After\` (seconds).
- **Lists** are paginated: \`?page=&limit=\` or \`?cursor=&limit=\` (the response gives \`nextCursor\`). Bad values fall back to
  the defaults; limits are capped.
- **Caching:** every answer is \`Cache-Control: no-store\` unless an operation says otherwise; the few shared ones that may
  be cached send an \`ETag\` and answer \`304\` to a matching \`If-None-Match\`.
- **Real time:** live updates (messages, typing, notifications) come over Socket.IO, documented in docs/REALTIME.md.`;

// '/posts/:id/comments' -> '/posts/{id}/comments'
const toOpenApiPath = (route) => route.replace(/:(\w+)/g, '{$1}');
const paramNames = (route) => [...route.matchAll(/:(\w+)/g)].map((m) => m[1]);
// 'GET', '/posts/:id/comments' -> 'getPostsByIdComments'
function operationId(method, route) {
  const words = route.split('/').filter(Boolean).map((part) => (part.startsWith(':') ? `By-${part.slice(1)}` : part));
  const camel = words.join('-').split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return method.toLowerCase() + (camel || 'Root');
}

function build({ serverUrl } = {}) {
  const paths = {};
  const schemas = { ...components.schemas };
  for (const area of AREAS) {
    for (const [key, operation] of Object.entries(area)) {
      const [method, route] = key.split(' ');
      const verb = method.toLowerCase();
      const path = toOpenApiPath(route);
      if (paths[path]?.[verb]) throw new Error(`OpenAPI: ${key} is documented twice`);
      const { 'x-query': query, 'x-path-params': pathParams, ...rest } = operation;
      const names = paramNames(route);
      const unknown = Object.keys(pathParams).filter((name) => !names.includes(name));
      if (unknown.length) throw new Error(`OpenAPI: ${key} describes path params it doesn't have: ${unknown.join(', ')}`);
      const parameters = [
        ...names.map((name) => ({ name, in: 'path', required: true, schema: pathParams[name] || s.id() })),
        ...Object.entries(query).map(([name, { schema, required }]) => ({ name, in: 'query', required, schema }))
      ];
      paths[path] = paths[path] || {};
      paths[path][verb] = { operationId: operationId(method, route), ...rest, ...(parameters.length && { parameters }) };
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: 'MySocialApp API', version: require('../../package.json').version, description: DESCRIPTION },
    ...(serverUrl && { servers: [{ url: serverUrl }] }),
    tags: TAGS,
    paths,
    components: { securitySchemes: components.securitySchemes, responses: components.responses, schemas }
  };
}

module.exports = { build, toOpenApiPath };
