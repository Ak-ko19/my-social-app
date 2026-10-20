// Day 67: the API spec -- server status, public config, crash reports, link
// previews, share cards, web push and the machine-only cleanup.
const { s, ref, body, json, text, html, empty, op, q } = require('../helpers');

// Day 74: the answers that may be cached (everything else is no-store).
const NOT_MODIFIED = empty('Not modified: the copy named in If-None-Match (its ETag) is still current');

const SHARE_NOTE = 'Plain HTML with Open Graph / Twitter card tags for link-preview crawlers (frontend/vercel.json sends '
  + 'only crawlers here, by user agent), and an instant redirect to the app for anyone else. Only something everyone may see '
  + 'gets a real card; anything else -- private, deleted, missing -- gets the same generic card, so a link never reveals what is behind it.';

module.exports = {
  'GET /': op({
    tag: 'System', auth: 'public',
    summary: 'Is the server up? (no database check)',
    description: 'The keep-alive target: cheap, never touches the database.',
    responses: { 200: text('A short greeting') }
  }),
  'GET /health': op({
    tag: 'System', auth: 'public',
    summary: 'Server and database status, for uptime monitors',
    description: 'Never says why the database is down; that goes to the server log. Not cached.',
    responses: {
      200: json(ref('Health'), 'The server is up and its database answers'),
      503: json(ref('HealthDown'), 'The database did not answer within 3 seconds')
    }
  }),
  'GET /config': op({
    tag: 'System', auth: 'public',
    summary: 'Public settings the app needs before anyone logs in',
    description: 'Cached for 5 minutes.',
    responses: { 200: json(ref('Config'), 'The settings'), 304: NOT_MODIFIED }
  }),
  'GET /openapi.json': op({
    tag: 'System', auth: 'public',
    summary: 'This API description (OpenAPI 3.1)',
    description: 'On outside production; in production only when API_DOCS=1 (else 404). Built from backend/docs/openapi.',
    responses: { 200: json(s.object({ openapi: s.str(), info: s.object({}), paths: s.object({}) }), 'The spec'), 304: NOT_MODIFIED, 404: html('The docs are off (production without API_DOCS=1)') }
  }),
  'GET /docs': op({
    tag: 'System', auth: 'public',
    summary: 'This API reference as a web page (Swagger UI)',
    description: 'Same switch as GET /openapi.json. "Try it out" sends real requests: use Authorize with a token from POST /login.',
    responses: { 200: html('The page'), 404: html('The docs are off (production without API_DOCS=1)') }
  }),
  'GET /form-token': op({
    tag: 'Auth', auth: 'public',
    summary: 'A form token for the signup and forgot-password forms (bot protection)',
    description: 'Fetch it when the form opens and send it back as `formToken`. Signup refuses a token younger than 3 seconds '
      + '(nobody fills the form that fast) and both refuse an expired one.',
    responses: { 200: json(ref('FormToken'), 'A fresh token') }
  }),
  'POST /client-errors': op({
    tag: 'System', auth: 'optional', limited: true,
    summary: 'Report a crash in the browser',
    description: 'Shown in Admin > Errors. Every field is capped; only the page path is kept (never the query string), and long '
      + 'hex runs such as a reset token are normalised away. Limit: 20 reports per 15 minutes per network.',
    requestBody: body({
      message: s.str('The error message (first 500 characters kept)'),
      kind: s.enum(['error', 'unhandledrejection', 'render'], 'Anything else counts as "error"'),
      url: s.str('The page it happened on'),
      stack: s.str('The stack trace (first 4000 characters kept)')
    }, { required: ['message'] }),
    responses: { 204: empty('Recorded'), 400: text('message is required') }
  }),
  'GET /link-preview': op({
    tag: 'Links', auth: 'user', limited: true,
    summary: "A link's title, description and site name, for a preview card",
    description: 'The server fetches the page (http/https only, never a private address, with a timeout and a size limit) and caches '
      + 'the result; the response may be cached privately for an hour.',
    query: { url: q(s.str('The link, http(s) only'), true) },
    responses: {
      200: json(ref('LinkPreview'), 'The preview'),
      204: empty('Nothing to show, or the page cannot or must not be fetched'),
      304: NOT_MODIFIED,
      400: text('A valid http(s) url is required')
    }
  }),
  'GET /share/posts/:id': op({
    tag: 'Links', auth: 'public',
    summary: "A post's share card (HTML for link-preview crawlers)",
    description: SHARE_NOTE,
    pathParams: { id: s.str('The post id; anything else gets the generic card') },
    responses: { 200: html('The card page'), 304: NOT_MODIFIED }
  }),
  'GET /share/profiles/:id': op({
    tag: 'Links', auth: 'public',
    summary: "A profile's share card (HTML for link-preview crawlers)",
    description: SHARE_NOTE,
    pathParams: { id: s.str('A user id or a username') },
    responses: { 200: html('The card page'), 304: NOT_MODIFIED }
  }),
  'GET /share/pages/:id': op({
    tag: 'Links', auth: 'public',
    summary: "A page's share card (HTML for link-preview crawlers)",
    description: SHARE_NOTE,
    pathParams: { id: s.str('The page id; anything else gets the generic card') },
    responses: { 200: html('The card page'), 304: NOT_MODIFIED }
  }),
  'GET /push/config': op({
    tag: 'Push', auth: 'public',
    summary: 'Whether web push is on, and the key to subscribe with',
    description: 'Cached for 5 minutes.',
    responses: { 200: json(ref('PushConfig'), 'The push settings'), 304: NOT_MODIFIED }
  }),
  'POST /push/subscribe': op({
    tag: 'Push', auth: 'user', limited: true,
    summary: "Turn on push notifications for this browser",
    description: 'The body is the browser\'s PushSubscription (JSON). The same endpoint always means the same browser, so it moves '
      + 'to whoever is logged in now. Only known push services are accepted.',
    requestBody: body({
      endpoint: s.str("The push service URL from the browser's subscription"),
      keys: s.object({ p256dh: s.str(), auth: s.str() }, { extra: false })
    }, { required: ['endpoint', 'keys'] }),
    responses: {
      201: json(ref('Ok'), 'Subscribed'),
      400: text('That push endpoint is not accepted / Invalid push subscription keys'),
      503: text('Push notifications are not available right now (push is off on this server)')
    }
  }),
  'DELETE /push/subscribe': op({
    tag: 'Push', auth: 'user',
    summary: 'Turn off push notifications for this browser',
    requestBody: body({ endpoint: s.str('The subscription endpoint to remove') }, { optional: true }),
    responses: { 204: empty('Removed (or there was nothing to remove)') }
  }),
  'POST /internal/cleanup': op({
    tag: 'System', auth: 'secret',
    summary: 'Run the daily cleanup (machines only)',
    description: 'Deletes expired stories, old notifications and other expired data with their stored files. Called daily by '
      + '.github/workflows/cleanup.yml. A missing or wrong secret gets 404, so the route is not advertised.',
    query: { dryRun: q(s.enum(['1'], '1: only count what would be removed')) },
    responses: {
      200: json(ref('CleanupResult'), 'What was (or would be) removed'),
      404: text('Not found (no or wrong secret)'),
      500: json(s.object({ error: s.str() }), 'The cleanup failed (logged and in Admin > Errors)')
    }
  })
};
