// Logs the full error server-side (stack trace, DB error codes, etc.) but
// sends only a generic message to the client -- raw err.message can leak
// internal details (query structure, column names, driver errors) that are
// useful to an attacker and meaningless to a legitimate user.
function sendServerError(res, err, publicMessage) {
  console.error(err);
  res.status(500).send(publicMessage);
}

module.exports = { sendServerError };
