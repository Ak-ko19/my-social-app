const rateLimit = require('express-rate-limit');

function createLimiter({ windowMs, max, message, skipSuccessfulRequests = false }) {
  // Supertest requests in the automated test suite all share one source
  // "IP", so limits meant to bound a single real client would otherwise
  // trip across unrelated test cases in the same run. Jest sets
  // NODE_ENV=test automatically, so this never applies outside tests.
  if (process.env.NODE_ENV === 'test') {
    return (req, res, next) => next();
  }
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true, // expose RateLimit-* headers (draft-7: includes RateLimit-Reset)
    legacyHeaders: false,
    skipSuccessfulRequests,
    message,
    handler: (req, res, next, options) => {
      // RateLimit-Reset (from standardHeaders) is a Unix timestamp; Retry-After
      // is the standard HTTP 429 header (RFC 9110 ยง10.2.3) -- expressed in
      // seconds-from-now, which most HTTP clients/browsers actually honor
      // for backoff, unlike the RateLimit-* draft header.
      res.set('Retry-After', Math.ceil(windowMs / 1000).toString());
      res.status(options.statusCode).send(options.message);
    }
  });
}

// App-wide floor for every request, sensitive-endpoint limiters above stack
// on top of this for the routes that need a tighter budget. Generous enough
// that no legitimate user of a single-page app doing normal browsing/
// polling should ever hit it -- this exists to blunt a scripted flood, not
// to shape ordinary traffic.
const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests. Please try again later.'
});

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

// Reports feed a (future) moderation queue -- loose enough for a legitimate
// user reporting several bad posts in a session, tight enough to block
// someone trying to mass-flag a target or spam the queue with noise.
const reportLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Too many reports submitted. Please try again later.'
});

// Follow/unfollow churn (mass-following to farm attention, or a scripted
// follow/unfollow loop) is the abuse shape here -- generous enough for
// normal browsing-and-following behavior.
const followLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many follow requests. Please try again later.'
});

// Sensitive account-lifecycle actions, all requiring the current password --
// bounded mainly as defense in depth against a stolen/replayed session
// token being used to brute-force the password confirmation step.
const accountActionLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please try again in 15 minutes.'
});

// Same shape as forgotPasswordLimiter -- prevents email-bombing a victim's
// inbox via repeated resend requests.
const resendVerificationLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many verification emails requested. Please try again in 15 minutes.'
});

module.exports = {
  globalLimiter,
  loginLimiter,
  signupLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  reportLimiter,
  followLimiter,
  accountActionLimiter,
  resendVerificationLimiter,
  createLimiter
};
