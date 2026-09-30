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
  resendVerificationLimiter,
  signupDailyLimiter,
  forgotPasswordEmailLimiter
} = require('../middleware/rateLimiter');
const { formGuard, sendFormToken, SIGNUP_MIN_MS, FORGOT_MIN_MS } = require('../services/botProtection');
// Optional; a no-op until both Turnstile keys are set.
const { turnstileGuard } = require('../services/turnstile');

// Day 11: the signup and forgot-password forms fetch this when they open.
router.get('/form-token', sendFormToken);
router.post('/signup', signupLimiter, signupDailyLimiter, formGuard(SIGNUP_MIN_MS), turnstileGuard, authController.signup);
router.post('/login', loginLimiter, formGuard(null), authController.login);
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  formGuard(FORGOT_MIN_MS),
  turnstileGuard,
  forgotPasswordEmailLimiter,
  authController.forgotPassword
);
router.post('/reset-password/:token', resetPasswordLimiter, authController.resetPassword);
router.put('/profile/password', authMiddleware, accountActionLimiter, authController.changePassword);
router.post('/profile/deactivate', authMiddleware, accountActionLimiter, authController.deactivateAccount);
router.delete('/profile', authMiddleware, accountActionLimiter, authController.deleteAccount);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authMiddleware, resendVerificationLimiter, authController.resendVerification);

module.exports = router;
