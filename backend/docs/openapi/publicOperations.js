// Day 92 (AUDIT_REPORT_4 B5): the operations meant to work without a login,
// reviewed one by one. openapiSpec.test checks that the spec's public
// operations are exactly these (and the spec is checked against the real
// middleware), so a new public route needs a deliberate line here.
// e2e/c4-audit-checks.cjs reads the same list.
module.exports = [
  // The app itself, health and the API reference.
  'GET /',
  'GET /health',
  'GET /config',
  'GET /openapi.json',
  'GET /docs',
  // Before a login: bot protection, signing up and in, email links.
  'GET /form-token',
  'POST /signup',
  'POST /login',
  'POST /login/2fa', // needs the challenge from POST /login
  'POST /forgot-password',
  'POST /reset-password/{token}',
  'GET /verify-email/{token}',
  // Browsers report CSP violations without a login (rate limited).
  'POST /csp-reports',
  // Link-preview crawlers: only what anyone may see (getVisiblePost).
  'GET /share/posts/{id}',
  'GET /share/profiles/{id}',
  'GET /share/pages/{id}',
  // The push service's public key.
  'GET /push/config',
  // Follower counts are shown on public profile cards.
  'GET /users/{id}/follow-counts'
];
