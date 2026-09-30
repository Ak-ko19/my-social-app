const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
const { authorize, touchSession } = require('../services/sessionService');
const { sendServerError } = require('../utils/sendError');
const logger = require('../utils/logger');

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
  let verdict;
  try {
    // One query: B12 ban check + Day 8 session check (signed out on
    // another device, password changed, session expired).
    verdict = await authorize(decoded);
  } catch (err) {
    return sendServerError(res, err, 'Something went wrong. Please try again later.');
  }
  // B12: a ban ends existing sessions immediately. 401 (not 403) so the
  // frontend's 401 handler logs the banned user out.
  if (verdict === 'banned') {
    return res.status(401).send('This account has been banned');
  }
  if (verdict !== 'ok') {
    return res.status(401).send('Invalid or expired token');
  }
  req.userId = decoded.userId;
  req.sessionId = decoded.sid || null; // null for tokens from before sessions
  // "Last active" in the sessions list; at most one write per 5 minutes,
  // and the request never waits for it.
  if (req.sessionId) {
    touchSession(req.sessionId).catch((err) => logger.error('session touch failed', { err }));
  }
  next();
}

module.exports = authMiddleware;
