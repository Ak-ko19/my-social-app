// Day 11: bot protection that needs no outside service.
//
// - Form tokens (signup, forgot password): the form asks the server for a
//   signed "issued at" timestamp when it opens and sends it back on
//   submit. A bot that posts straight to the API has none; one that is
//   faster than any human (under a few seconds) is told to wait.
// - Honeypot: a field real users never see or fill.
// - Login throttle: after repeated wrong passwords for one account, every
//   further attempt on it waits a little longer. Slows password guessing
//   spread over many IPs (the per-IP limiter can't see that), without ever
//   locking the real owner out.
//
// Off under the automated test suite (Jest sets NODE_ENV=test) unless
// BOT_CHECKS_IN_TESTS=1, same as the rate limiters.
const crypto = require('crypto');

const TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const RELOAD = 'Please reload the page and try again.';
const TOO_FAST = 'Please wait a moment and try again.';

function enabled() {
  return process.env.NODE_ENV !== 'test' || process.env.BOT_CHECKS_IN_TESTS === '1';
}

// A key of its own (derived, with a purpose label), so a form token can
// never pass for a JWT or anything else signed with JWT_SECRET.
function tokenKey() {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('mysocialapp form token v1').digest();
}

function sign(issuedAt) {
  return crypto.createHmac('sha256', tokenKey()).update(String(issuedAt)).digest('base64url');
}

function issueFormToken(now = Date.now()) {
  return `${now}.${sign(now)}`;
}

// null if fine, else the message to answer with (400).
function checkFormToken(token, minAgeMs, now = Date.now()) {
  if (!enabled()) return null;
  if (typeof token !== 'string') return RELOAD;
  const [issued, mac] = token.split('.');
  const issuedAt = Number(issued);
  if (!/^\d{13}$/.test(issued || '') || !mac) return RELOAD;
  const expected = Buffer.from(sign(issuedAt));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return RELOAD;
  const age = now - issuedAt;
  if (age < 0 || age > TOKEN_MAX_AGE_MS) return RELOAD;
  if (age < minAgeMs) return TOO_FAST;
  return null;
}

// Any value in the hidden field means a bot filled in every input.
function honeypotTripped(body) {
  if (!enabled()) return false;
  return typeof body?.website === 'string' && body.website.trim() !== '';
}

// ---- Login throttle ----
const WINDOW_MS = 15 * 60 * 1000;
const FREE_FAILURES = 3;
const MAX_DELAY_MS = 8000;
const MAX_TRACKED = 10000;
const failures = new Map(); // email -> { count, first }

const keyOf = (email) => String(email || '').trim().toLowerCase();

function current(email, now) {
  const entry = failures.get(keyOf(email));
  if (!entry) return 0;
  if (now - entry.first > WINDOW_MS) {
    failures.delete(keyOf(email));
    return 0;
  }
  return entry.count;
}

// How long to wait before answering a login for this email: 0 for the
// first few failures, then 1 s, 2 s, 4 s, 8 s (max).
function loginDelayMs(email, now = Date.now()) {
  if (!enabled()) return 0;
  const count = current(email, now);
  if (count < FREE_FAILURES) return 0;
  return Math.min(1000 * 2 ** (count - FREE_FAILURES), MAX_DELAY_MS);
}

function recordLoginFailure(email, now = Date.now()) {
  if (!enabled()) return;
  const key = keyOf(email);
  if (!key) return;
  const count = current(email, now);
  if (count === 0 && failures.size >= MAX_TRACKED) {
    failures.delete(failures.keys().next().value); // oldest first: bounded memory
  }
  failures.set(key, { count: count + 1, first: count === 0 ? now : failures.get(key).first });
}

function recordLoginSuccess(email) {
  failures.delete(keyOf(email));
}

// A delay alone doesn't slow a bot that fires many guesses in parallel:
// each would wait, then all be checked together. So at most MAX_WAITING
// attempts per account may be waiting at once; more get a 429 straight
// away.
const MAX_WAITING = 3;
const waiting = new Map(); // email -> attempts currently in their delay

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits out this account's delay. Resolves false (answer 429) when too many
// attempts on the account are already waiting.
async function waitLoginTurn(email) {
  const delay = loginDelayMs(email);
  if (delay === 0) return true;
  const key = keyOf(email);
  const count = waiting.get(key) || 0;
  if (count >= MAX_WAITING) return false;
  waiting.set(key, count + 1);
  try {
    await sleep(delay);
  } finally {
    const left = (waiting.get(key) || 1) - 1;
    if (left > 0) waiting.set(key, left);
    else waiting.delete(key);
  }
  return true;
}

// Route guard for the public forms. minAgeMs: the form token's minimum
// age, or null for a form without a token (login: password managers and
// the future mobile app post it directly).
function formGuard(minAgeMs) {
  return (req, res, next) => {
    if (honeypotTripped(req.body)) return res.status(400).send(RELOAD);
    if (minAgeMs !== null) {
      const problem = checkFormToken(req.body?.formToken, minAgeMs);
      if (problem) return res.status(400).send(problem);
    }
    next();
  };
}

function sendFormToken(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ token: issueFormToken() });
}

// Tests only.
function resetLoginThrottle() {
  failures.clear();
  waiting.clear();
}

module.exports = {
  issueFormToken,
  checkFormToken,
  honeypotTripped,
  loginDelayMs,
  recordLoginFailure,
  recordLoginSuccess,
  waitLoginTurn,
  formGuard,
  sendFormToken,
  resetLoginThrottle,
  RELOAD,
  TOO_FAST,
  TOO_MANY_LOGINS: 'Too many login attempts for this account. Please wait a moment and try again.',
  SIGNUP_MIN_MS: 3000,
  FORGOT_MIN_MS: 2000,
  MAX_TRACKED,
  MAX_WAITING
};
