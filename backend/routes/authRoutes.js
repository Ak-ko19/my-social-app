const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const {
  loginLimiter,
  signupLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  accountActionLimiter,
  resendVerificationLimiter
} = require('../middleware/rateLimiter');

router.post('/signup', signupLimiter, authController.signup);
router.post('/login', loginLimiter, authController.login);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password/:token', resetPasswordLimiter, authController.resetPassword);
router.put('/profile/password', authMiddleware, accountActionLimiter, authController.changePassword);
router.post('/profile/deactivate', authMiddleware, accountActionLimiter, authController.deactivateAccount);
router.delete('/profile', authMiddleware, accountActionLimiter, authController.deleteAccount);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authMiddleware, resendVerificationLimiter, authController.resendVerification);

module.exports = router;
