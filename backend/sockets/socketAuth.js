const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// Socket.io handshake middleware -- mirrors middleware/authMiddleware.js, but
// reads the token from handshake.auth (set by the client as
// `io(url, { auth: { token } })`) instead of an Authorization header, since
// the initial socket handshake has no per-request header the client controls
// on every reconnect.
function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('No token provided'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
}

module.exports = socketAuthMiddleware;
