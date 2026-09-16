const rateLimit = require('express-rate-limit');

function createLimiter({ windowMs, max, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true, // expose RateLimit-* headers
    legacyHeaders: false,
    skipSuccessfulRequests,
    message,
    handler: (req, res, next, options) => {
      res.status(options.statusCode).send(options.message);
    }
  });
}

// Credential-guessing surface: keep tight. Only failed attempts count
// against the limit (skipSuccessfulRequests) so a legitimate user who
// authenticates correctly is never blocked by their own past attempts --
// only repeated *wrong* guesses trip it, which is what brute forcing looks
// like.
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  skipSuccessfulRequests: true
});

// Mass-account-creation / abuse surface: looser window, still bounded.
const signupLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many accounts created from this network. Please try again later.'
});

// Prevents email-bombing a victim and throttles enumeration probing,
// even though the response body itself is already enumeration-safe.
const forgotPasswordLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please try again in 15 minutes.'
});

// Reset tokens are 256-bit random (not brute-forceable in practice), but
// rate limit anyway as defense in depth.
const resetPasswordLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please try again in 15 minutes.'
});

module.exports = { loginLimiter, signupLimiter, forgotPasswordLimiter, resetPasswordLimiter };
