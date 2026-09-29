const { report } = require('../services/errorLogService');

// "METHOD /route/:pattern" -- the route PATTERN, not the concrete URL, so
// the same bug on every post id is one group in the error log.
function routeOf(req) {
  if (!req) return null;
  const path = req.route ? `${req.baseUrl || ''}${req.route.path}` : req.path;
  return `${req.method} ${path}`;
}

// Logs the full error server-side (stack trace, DB error codes, etc.) and
// records it in the error log (Day 10), but sends only a generic message to
// the client -- raw err.message can leak internal details (query structure,
// column names, driver errors) that are useful to an attacker and
// meaningless to a legitimate user.
function sendServerError(res, err, publicMessage) {
  console.error(err);
  const req = res.req;
  report(err, { source: 'api', route: routeOf(req), status: 500, userId: req && req.userId });
  res.status(500).send(publicMessage);
}

module.exports = { sendServerError, routeOf };
