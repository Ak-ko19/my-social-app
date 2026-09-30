const crypto = require('crypto');
const express = require('express');
const cleanupService = require('../services/cleanupService');
const logger = require('../utils/logger');
const { report } = require('../services/errorLogService');

const router = express.Router();

// Machine-only endpoints, authorized by a shared secret instead of a user
// login. Without the secret configured they don't exist (404), and a wrong
// secret gets the same 404, so the endpoint isn't advertised.
function requireSecret(envName) {
  return (req, res, next) => {
    const expected = process.env[envName];
    const header = req.headers.authorization || '';
    const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    // Hashing first gives equal-length buffers, so timingSafeEqual can
    // compare without leaking the secret's length or contents via timing.
    const digest = (value) => crypto.createHash('sha256').update(value).digest();
    if (!expected || !given || !crypto.timingSafeEqual(digest(given), digest(expected))) {
      return res.status(404).send('Not found');
    }
    next();
  };
}

// POST /internal/cleanup[?dryRun=1] -- Day 9 daily housekeeping, called by
// .github/workflows/cleanup.yml.
router.post('/internal/cleanup', requireSecret('CLEANUP_SECRET'), async (req, res) => {
  try {
    const result = await cleanupService.run({ dryRun: req.query.dryRun === '1' });
    logger.info('cleanup finished', result);
    res.json(result);
  } catch (err) {
    logger.error('cleanup failed', { err });
    report(err, { source: 'api', route: 'POST /internal/cleanup', status: 500 });
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

module.exports = router;
