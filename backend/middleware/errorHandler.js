const multer = require('multer');
const { report } = require('../services/errorLogService');
const { routeOf, isUnsavableText, sendUnsavableText } = require('../utils/sendError');
const logger = require('../utils/logger');

// Errors that reach Express's error handler: upload rejections from multer
// and the file filters, upload failures at Cloudinary, the CORS rejection,
// malformed JSON bodies, and anything unexpected. Each gets the right status
// and a message meant for users; provider and internal error text is only
// logged, never sent (it used to be sent as a 400).

// A problem with what the client sent: 400, message shown to the user.
function clientError(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// The upload provider (Cloudinary) failed: 502, generic text. The wording
// follows the "<Action> failed. Please try again later." convention the
// frontend translates.
function uploadFailed(cause) {
  const err = new Error('Upload failed. Please try again later.');
  err.status = 502;
  err.expose = true;
  err.cause = cause;
  return err;
}

const FILE_TOO_LARGE = 'File is too large (max 5 MB)';

// Express only treats a middleware with all 4 arguments as an error handler.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    return res.status(400).send(err.code === 'LIMIT_FILE_SIZE' ? FILE_TOO_LARGE : err.message);
  }
  // Our own clientError/uploadFailed, the CORS rejection, and body-parser's
  // errors (e.g. malformed JSON) all carry a status and expose = true.
  if (err.expose && err.status >= 400 && err.status < 600) {
    if (err.status >= 500) {
      logger.error('request failed', { route: routeOf(req), status: err.status, err: err.cause || err });
      // e.g. an upload provider failure: the provider's own error is logged.
      report(err.cause || err, { source: 'api', route: routeOf(req), status: err.status, userId: req.userId });
    }
    return res.status(err.status).send(err.message);
  }
  // Day 75: a NUL character in the text (see utils/sendError.js).
  if (isUnsavableText(err)) return sendUnsavableText(res);
  logger.error('request failed', { route: routeOf(req), status: 500, err });
  report(err, { source: 'api', route: routeOf(req), status: 500, userId: req.userId });
  return res.status(500).send('Something went wrong. Please try again later.');
}

module.exports = { errorHandler, clientError, uploadFailed, FILE_TOO_LARGE };
