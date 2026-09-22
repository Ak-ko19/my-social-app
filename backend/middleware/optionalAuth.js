const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// Same token check as authMiddleware, but never rejects the request --
// public endpoints (GET /posts, GET /posts/:id, GET /profile/:id, search)
// need to know WHO is viewing (to filter blocked content, gate a private
// account, compute liked_by_me) without requiring the viewer to be logged
// in at all. req.userId is left undefined (not null) when there's no valid
// token, matching what an unauthenticated request already looked like to
// every controller before this middleware existed.
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
  } catch (err) {
    // An expired/invalid token on a public route is not an error -- just
    // treat the request as anonymous rather than rejecting it.
  }
  next();
}

module.exports = optionalAuth;
