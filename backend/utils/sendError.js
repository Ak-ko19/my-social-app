const { report } = require('../services/errorLogService');
const logger = require('./logger');

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
// Day 75: Postgres refuses a NUL character (U+0000) in text ("invalid byte
// sequence", SQLSTATE 22021) -- in a post, a message, a search, even a login.
// That is the request's fault, not a server error: a 400, and not a row in
// the error log (anyone could fill it with them). Every route ends up here
// or in middleware/errorHandler.js, so this covers them all.
// (The socket handlers send the same text; sockets/index.js.)
const UNSAVABLE_TEXT = "This text contains a character that can't be saved.";

function isUnsavableText(err) {
  return err?.code === '22021';
}

function sendUnsavableText(res) {
  return res.status(400).send(UNSAVABLE_TEXT);
}

function sendServerError(res, err, publicMessage) {
  if (isUnsavableText(err)) return sendUnsavableText(res);
  const req = res.req;
  logger.error('request failed', { route: routeOf(req), status: 500, err });
  report(err, { source: 'api', route: routeOf(req), status: 500, userId: req && req.userId });
  res.status(500).send(publicMessage);
}

module.exports = { sendServerError, routeOf, isUnsavableText, sendUnsavableText, UNSAVABLE_TEXT };
