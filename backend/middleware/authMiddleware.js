const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
const { isBanned } = require('../services/accountStatusService');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).send('No token provided');
  }
  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).send('Invalid or expired token');
  }
  try {
    // B12: a ban ends existing sessions immediately. 401 (not 403) so the
    // frontend's 401 handler logs the banned user out.
    if (await isBanned(decoded.userId)) {
      return res.status(401).send('This account has been banned');
    }
  } catch (err) {
    console.error('Ban check failed:', err.message);
    return res.status(500).send('Something went wrong. Please try again later.');
  }
  req.userId = decoded.userId;
  next();
}

module.exports = authMiddleware;
