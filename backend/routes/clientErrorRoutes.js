const express = require('express');
const optionalAuth = require('../middleware/optionalAuth');
const { createLimiter } = require('../middleware/rateLimiter');
const { report, normalise } = require('../services/errorLogService');

const router = express.Router();

// Browsers report their crashes here (Day 10), so errors that only happen on
// someone's phone show up in the admin error log too. Public (a crash can
// happen before login), so: a tight per-IP limit, every field capped, and
// only the page PATH is kept -- never the query string, and long hex runs
// (like a reset-password token in the path) are normalised away.
const clientErrorLimiter = createLimiter({
  keyBy: 'ip',
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many error reports.'
});

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

function pagePath(url) {
  try {
    return normalise(new URL(url, 'http://x').pathname).slice(0, 200);
  } catch {
    return null;
  }
}

router.post('/client-errors', clientErrorLimiter, optionalAuth, (req, res) => {
  const message = text(req.body.message, 500).trim();
  if (!message) return res.status(400).send('message is required');
  const kind = ['error', 'unhandledrejection', 'render'].includes(req.body.kind) ? req.body.kind : 'error';
  report(new Error(message), {
    source: 'client',
    route: `${kind} ${pagePath(req.body.url) || '?'}`,
    stack: text(req.body.stack, 4000) || null,
    userId: req.userId
  });
  res.status(204).end();
});

module.exports = router;
