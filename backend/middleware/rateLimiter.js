const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Who a request counts against. The prefixes keep user 7 and an IP that
// happens to read "7" in separate buckets.
//
// ipKeyGenerator is the library's own default: IPv4 as-is, IPv6 grouped
// per /56, so one host can't dodge a limit by rotating through its IPv6
// addresses. req.ip is the real client thanks to `trust proxy` (server.js).
function ipKey(req) {
  return `ip:${ipKeyGenerator(req.ip)}`;
}

// For limiters mounted after authMiddleware. Many users can share one IP
// (mobile carrier NAT, campus Wi-Fi), so logged-in budgets follow the
// account. The IP fallback only matters if a route ever mounts this before
// authMiddleware: better an IP bucket than one `user:undefined` bucket
// shared by everyone.
function userKey(req) {
  return req.userId ? `user:${req.userId}` : ipKey(req);
}

// For limiters that run before auth (the global one). The token must be
// VERIFIED, not just decoded: otherwise anyone could invent user IDs and
// get a fresh bucket per request. Missing, invalid or expired token ->
// the client's IP.
function userOrIpKey(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const { userId } = jwt.verify(header.slice('Bearer '.length), process.env.JWT_SECRET);
      if (userId) return `user:${userId}`;
    } catch {
      // Falls through to the IP key; authMiddleware answers the 401.
    }
  }
  return ipKey(req);
}

// Day 11: for limits that protect one email address whichever network the
// requests come from (forgot password: stops bombing a victim's inbox from
// many IPs). Hashed so the limiter's memory holds no addresses. No usable
// email -> the IP (the controller rejects the request anyway).
function emailKey(req) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) return ipKey(req);
  return `email:${crypto.createHash('sha256').update(email).digest('hex')}`;
}

const KEY_GENERATORS = { ip: ipKey, user: userKey, userOrIp: userOrIpKey, email: emailKey };

function createLimiter({ windowMs, max, message, keyBy, skipSuccessfulRequests = false }) {
  const keyGenerator = KEY_GENERATORS[keyBy];
  if (!keyGenerator) {
    throw new Error(`createLimiter: keyBy must be one of ${Object.keys(KEY_GENERATORS).join(', ')}`);
  }
  // Supertest requests in the automated test suite all share one source
  // "IP", so limits meant to bound a single real client would otherwise
  // trip across unrelated test cases in the same run. Jest sets
  // NODE_ENV=test automatically, so this never applies outside tests.
  // tests/api/rateLimit.test.js sets RATE_LIMIT_IN_TESTS=1 to run the real
  // limiters, so a keying bug like the shared-proxy-IP one can't slip
  // through again.
  if (process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== '1') {
    return (req, res, next) => next();
  }
  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    standardHeaders: true, // expose RateLimit-* headers (draft-7: includes RateLimit-Reset)
    legacyHeaders: false,
    skipSuccessfulRequests,
    message,
    handler: (req, res, next, options) => {
      // RateLimit-Reset (from standardHeaders) is a Unix timestamp; Retry-After
      // is the standard HTTP 429 header (RFC 9110 section 10.2.3) -- expressed in
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
  keyBy: 'userOrIp',
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests. Please try again later.'
});

// Credential-guessing surface: keep tight. Only failed attempts count
// against the limit (skipSuccessfulRequests) so a legitimate user who
// authenticates correctly is never blocked by their own past attempts --
// only repeated *wrong* guesses trip it, which is what brute forcing looks
// like.
// This and the other anonymous surfaces below (signup, forgot/reset
// password) are keyed by IP even when a token is sent: otherwise an
// attacker could reset their counter by switching between tokens from
// throwaway accounts.
const loginLimiter = createLimiter({
  keyBy: 'ip',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  skipSuccessfulRequests: true
});

// Day 77: the login's second step (a code from the authenticator app).
// Only someone who already has the password gets here; wrong codes are
// also capped per account (services/twoFactorService.js). A little looser
// than loginLimiter: mistyping a 6-digit code is easy.
const twoFactorLoginLimiter = createLimiter({
  keyBy: 'ip',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  skipSuccessfulRequests: true
});

// Mass-account-creation / abuse surface. Day 11: tightened from 10/hour to
// 5/hour, plus a daily cap so a script can't just pace itself at 5 an hour
// around the clock. Failed attempts count too (a bot probing names).
const signupLimiter = createLimiter({
  keyBy: 'ip',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many accounts created from this network. Please try again later.'
});

const signupDailyLimiter = createLimiter({
  keyBy: 'ip',
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  message: 'Too many accounts created from this network. Please try again later.'
});

// Prevents email-bombing a victim and throttles enumeration probing,
// even though the response body itself is already enumeration-safe.
const forgotPasswordLimiter = createLimiter({
  keyBy: 'ip',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please try again in 15 minutes.'
});

// Day 11: per address, across all networks -- at most 3 reset emails an
// hour to any one inbox.
const forgotPasswordEmailLimiter = createLimiter({
  keyBy: 'email',
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many reset emails requested for this address. Please try again in an hour.'
});

// Reset tokens are 256-bit random (not brute-forceable in practice), but
// rate limit anyway as defense in depth.
const resetPasswordLimiter = createLimiter({
  keyBy: 'ip',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please try again in 15 minutes.'
});

// Reports feed a (future) moderation queue -- loose enough for a legitimate
// user reporting several bad posts in a session, tight enough to block
// someone trying to mass-flag a target or spam the queue with noise.
const reportLimiter = createLimiter({
  keyBy: 'user',
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Too many reports submitted. Please try again later.'
});

// Follow/unfollow churn (mass-following to farm attention, or a scripted
// follow/unfollow loop) is the abuse shape here -- generous enough for
// normal browsing-and-following behavior.
const followLimiter = createLimiter({
  keyBy: 'user',
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many follow requests. Please try again later.'
});

// Sensitive account-lifecycle actions, all requiring the current password --
// bounded mainly as defense in depth against a stolen/replayed session
// token being used to brute-force the password confirmation step.
const accountActionLimiter = createLimiter({
  keyBy: 'user',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please try again in 15 minutes.'
});

// Day 31: reacting to messages is quick and repeatable (changing your mind
// is normal), but a script flipping reactions would spam everyone's chat.
// Its own budget, so reactions never use up the message-send limit.
const messageReactionLimiter = createLimiter({
  keyBy: 'user',
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many reactions. Please try again later.'
});

// Day 28: "Download your information" reads everything an account has --
// heavy, and rarely needed more than once.
const dataExportLimiter = createLimiter({
  keyBy: 'user',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many downloads. Please try again in an hour.'
});

// Same shape as forgotPasswordLimiter -- prevents email-bombing a victim's
// inbox via repeated resend requests.
const resendVerificationLimiter = createLimiter({
  keyBy: 'user',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many verification emails requested. Please try again in 15 minutes.'
});

// Day 19: each uncached preview makes the server fetch a web page. A feed
// full of links is a few dozen; this bounds a script using us as a fetcher.
const linkPreviewLimiter = createLimiter({
  keyBy: 'user',
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many requests. Please try again later.'
});

module.exports = {
  globalLimiter,
  linkPreviewLimiter,
  loginLimiter,
  twoFactorLoginLimiter,
  signupLimiter,
  signupDailyLimiter,
  forgotPasswordLimiter,
  forgotPasswordEmailLimiter,
  resetPasswordLimiter,
  reportLimiter,
  followLimiter,
  accountActionLimiter,
  dataExportLimiter,
  messageReactionLimiter,
  resendVerificationLimiter,
  createLimiter,
  rateLimitKeys: { ipKey, userKey, userOrIpKey, emailKey }
};
