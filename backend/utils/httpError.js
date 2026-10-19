const { sendServerError } = require('./sendError');

// Day 69: the one error type for "the request can't be done" -- a status
// and a message meant for the person (the frontend translates these
// messages, so keep their wording). Each area's error class extends it
// (CommunityError, PostInputError, MessageValidationError...), so a
// controller ends every handler with sendError instead of its own
// instanceof chain. `expose` makes Express's error handler (middleware/
// errorHandler.js) send it the same way when it arrives through next(err).
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.expose = true;
  }
}

// The catch-all at the end of a handler: an HttpError is sent as it is;
// anything else is a server error (logged, and in Admin > Errors) with
// `fallback` as the public message.
function sendError(res, err, fallback) {
  if (err instanceof HttpError) return res.status(err.status).send(err.message);
  return sendServerError(res, err, fallback);
}

module.exports = { HttpError, sendError };
