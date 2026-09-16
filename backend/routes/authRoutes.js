const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter, signupLimiter, forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimiter');

router.post('/signup', signupLimiter, authController.signup);
router.post('/login', loginLimiter, authController.login);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password/:token', resetPasswordLimiter, authController.resetPassword);

module.exports = router;
