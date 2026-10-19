// Day 67: shared parts of the OpenAPI spec -- security schemes, the common
// error responses, and the resource schemas the area files refer to with
// ref('Name').
const { s } = require('./helpers');

const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'The `token` from POST /login (or from a password change). Each login is a session (GET /sessions); '
      + 'a token stops working when its session is signed out, the password changes elsewhere, or the account is banned or suspended.'
  },
  cleanupSecret: {
    type: 'http',
    scheme: 'bearer',
    description: 'The server\'s CLEANUP_SECRET (machines only). Without it configured, or with a wrong one, the route answers 404.'
  }
};

const textError = (description) => ({ description, content: { 'text/plain': { schema: { type: 'string' } } } });

const responses = {
  Unauthorized: textError('Not logged in: no token, an invalid or expired token, a signed-out session, or a banned or suspended account.'),
  NotFound: textError('Not found.'),
  TooManyRequests: {
    description: 'Too many requests from this account or network; try again after `Retry-After` seconds.',
    headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until the limit resets' } },
    content: { 'text/plain': { schema: { type: 'string' } } }
  },
  ServerError: textError('Something went wrong on the server (it is logged and appears in Admin > Errors).')
};

const schemas = {
  Ok: s.object({ ok: s.bool() }),
  Health: s.object({
    status: s.enum(['ok']),
    db: s.enum(['ok']),
    uptimeSeconds: s.int('Seconds since the server started')
  }),
  HealthDown: s.object({ status: s.enum(['error']), db: s.enum(['down']) }),
  Config: s.object({
    emailEnabled: s.bool('false: emails cannot be sent right now, so the app hides email-based flows'),
    turnstileSiteKey: s.nullable(s.str('The public Cloudflare Turnstile key when the human check is on, else null'))
  }),
  FormToken: s.object({ token: s.str('Send it back as `formToken` with the signup / forgot-password form') }),
  LinkPreview: s.object({
    url: s.str('The page (normalised)'),
    title: s.nullable(s.str()),
    description: s.nullable(s.str()),
    siteName: s.nullable(s.str())
  }),
  PushConfig: s.object({ publicKey: s.nullable(s.str('The VAPID public key, or null when push is off on this server')) }),
  CleanupResult: s.object({}, { description: 'What the daily cleanup removed (counts by kind); with dryRun=1, what it would remove.' }),
  NewAccount: s.object({ id: s.id(), username: s.str(), email: s.str() }),
  LoginResult: s.object({
    token: s.str('Bearer token for this new session'),
    id: s.id(),
    username: s.str(),
    email: s.str(),
    reactivated: s.bool('true: the account was deactivated and this login reactivated it'),
    emailVerified: s.bool(),
    language: s.nullable(s.enum(['en', 'ar'], "The account's app language (null: never chosen)"))
  }),
  Suspended: s.object({ message: s.str(), until: s.time('When the suspension ends') }),
  PasswordChanged: s.object({
    message: s.str(),
    token: s.str('Only for a token from before sessions existed: a fresh token for this device')
  }, { optional: ['token'] }),
  Session: s.object({
    id: s.str('Session id (UUID)', { format: 'uuid' }),
    created_at: s.time(),
    last_seen_at: s.time(),
    current: s.bool('This is the session making the request'),
    device: s.object({
      browser: s.nullable(s.str('e.g. "Chrome", "Edge"; null when unknown')),
      os: s.nullable(s.str('e.g. "Windows", "Android"; null when unknown')),
      kind: s.enum(['mobile', 'desktop'])
    }, { description: "Read from the browser's user agent when the session was created" })
  })
};

module.exports = { securitySchemes, responses, schemas };
