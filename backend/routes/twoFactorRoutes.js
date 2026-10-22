const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { accountActionLimiter } = require('../middleware/rateLimiter');
const twoFactorController = require('../controllers/twoFactorController');

const router = express.Router();

// Day 77: two-factor authentication (services/twoFactorService.js). Each
// change re-checks the password or a code, so each is rate limited too.
router.get('/2fa', authMiddleware, twoFactorController.getStatus);
router.post('/2fa/setup', authMiddleware, accountActionLimiter, twoFactorController.setup);
router.post('/2fa/enable', authMiddleware, accountActionLimiter, twoFactorController.enable);
router.post('/2fa/disable', authMiddleware, accountActionLimiter, twoFactorController.disable);
router.post('/2fa/recovery-codes', authMiddleware, accountActionLimiter, twoFactorController.regenerateRecoveryCodes);

module.exports = router;
