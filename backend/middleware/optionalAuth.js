const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
const { authorize } = require('../services/sessionService');
const logger = require('../utils/logger');

// Same token check as authMiddleware, but never rejects the request --
// public endpoints (GET /posts, GET /posts/:id, GET /profile/:id, search)
// need to know WHO is viewing (to filter blocked content, gate a private
// account, compute liked_by_me) without requiring the viewer to be logged
// in at all. req.userId is left undefined (not null) when there's no valid
// token, matching what an unauthenticated request already looked like to
// every controller before this middleware existed.
async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  let decoded = null;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    // An expired/invalid token on a public route is not an error -- just
    // treat the request as anonymous rather than rejecting it.
  }
  // B12 / Day 8: a banned account, or a signed-out session, browses as
  // anonymous (never as itself).
  if (decoded) {
    try {
      if ((await authorize(decoded)) === 'ok') req.userId = decoded.userId;
    } catch (err) {
      logger.error('auth check failed (optional auth)', { err });
    }
  }
  next();
}

module.exports = optionalAuth;
