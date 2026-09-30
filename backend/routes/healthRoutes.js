const express = require('express');
const db = require('../db');
const logger = require('../utils/logger');

const router = express.Router();
const DB_TIMEOUT_MS = 3000;

// GET /health -- for uptime monitors: is the app up AND can it reach its
// database? Never says why the database is down (hostnames, auth errors):
// that goes to the log. GET / stays the no-DB keep-alive target.
router.get('/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  let timer;
  try {
    await Promise.race([
      db.query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`database did not answer within ${DB_TIMEOUT_MS} ms`)), DB_TIMEOUT_MS);
      })
    ]);
    res.json({ status: 'ok', db: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  } catch (err) {
    logger.error('health check: database unreachable', { err });
    res.status(503).json({ status: 'error', db: 'down' });
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;
