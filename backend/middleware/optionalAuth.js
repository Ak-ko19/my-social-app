const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
const { isBanned } = require('../services/accountStatusService');

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
  // B12: a banned account browses as anonymous (never as itself).
  if (decoded) {
    try {
      if (!(await isBanned(decoded.userId))) req.userId = decoded.userId;
    } catch (err) {
      console.error('Ban check failed:', err.message);
    }
  }
  next();
}

module.exports = optionalAuth;
