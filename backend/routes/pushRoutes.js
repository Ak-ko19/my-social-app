const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { accountActionLimiter } = require('../middleware/rateLimiter');
const pushService = require('../services/pushService');
const { sendServerError } = require('../utils/sendError');

const router = express.Router();

// Day 22: web push. GET /push/config is public (the frontend decides whether
// to offer the switch at all); turning it on/off needs a login.
router.get('/push/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ publicKey: pushService.vapid()?.publicKey ?? null });
});

router.post('/push/subscribe', authMiddleware, accountActionLimiter, async (req, res) => {
  if (!pushService.vapid()) return res.status(503).send('Push notifications are not available right now.');
  try {
    const result = await pushService.saveSubscription(req.userId, req.body, req.get('user-agent'));
    if (result !== 'ok') return res.status(400).send(result);
    res.status(201).json({ ok: true });
  } catch (err) {
    sendServerError(res, err, 'Turning on push notifications failed. Please try again later.');
  }
});

router.delete('/push/subscribe', authMiddleware, async (req, res) => {
  try {
    await pushService.removeSubscription(req.userId, req.body?.endpoint);
    res.status(204).end();
  } catch (err) {
    sendServerError(res, err, 'Turning off push notifications failed. Please try again later.');
  }
});

module.exports = router;
