const crypto = require('crypto');
const logger = require('../utils/logger');

// Day 10: one structured log line per request, written when the response
// finishes: method, route PATTERN (not the concrete URL, which can carry
// tokens), status, duration, user and a request id. The id is also sent
// back as X-Request-Id, so a user's bug report can be matched to its log
// line. Keep-alive and monitor pings are skipped (pure noise).
const SKIP = new Set(['/', '/health']);
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

function requestLogger(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = requestId;
  res.set('X-Request-Id', requestId);
  if (SKIP.has(req.path)) return next();

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const fields = {
      method: req.method,
      route: req.route ? `${req.baseUrl || ''}${req.route.path}` : '(no route)',
      status: res.statusCode,
      ms: Number((process.hrtime.bigint() - started) / 1000000n),
      requestId
    };
    if (req.userId) fields.userId = req.userId;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('request', fields);
  });
  next();
}

module.exports = requestLogger;
