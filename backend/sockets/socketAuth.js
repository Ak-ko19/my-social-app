const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// Socket.io handshake middleware -- mirrors middleware/authMiddleware.js, but
// reads the token from handshake.auth (set by the client as
// `io(url, { auth: { token } })`) instead of an Authorization header, since
// the initial socket handshake has no per-request header the client controls
// on every reconnect.
// err.data is socket.io's documented way to pass structured info through a
// middleware rejection to the client's connect_error handler -- used here
// (rather than matching on err.message, which is just a display string) so
// the frontend can reliably tell "this token is dead, stop retrying and
// send the user back to login" apart from a transient network/server error
// that's still worth the normal infinite-reconnect behavior.
function authFailure(message) {
  const err = new Error(message);
  err.data = { code: 'AUTH_FAILED' };
  return err;
}

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(authFailure('No token provided'));
  }

  try {
    // jwt.verify enforces the token's exp claim by default (every token
    // this app issues has one -- see authController's jwt.sign), throwing
    // TokenExpiredError for an expired one, which lands in this same catch.
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(authFailure('Invalid or expired token'));
  }
}

module.exports = socketAuthMiddleware;
