// Day 11: optional Cloudflare Turnstile ("are you human?" check) on the
// signup and forgot-password forms. Dormant until the owner adds BOTH keys
// (TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY -- see LATER.md); until then
// the honeypot, form tokens and rate limits (services/botProtection.js)
// are the whole defence.
const logger = require('../utils/logger');
const { isProduction } = require('../config/runtime');

const DEFAULT_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5000;
const NEEDED = 'Please complete the security check.';

const isSet = (value) => typeof value === 'string' && value.trim() !== '';

function turnstileSiteKey(env = process.env) {
  return isSet(env.TURNSTILE_SITE_KEY) && isSet(env.TURNSTILE_SECRET_KEY) ? env.TURNSTILE_SITE_KEY.trim() : null;
}

// 'ok' | 'failed' | 'unavailable' (Cloudflare couldn't be asked).
async function verifyTurnstile(token, ip, env = process.env) {
  try {
    // The override is for the browser suites' local stub only; production
    // always asks Cloudflare.
    const url = !isProduction(env) && isSet(env.TURNSTILE_VERIFY_URL) ? env.TURNSTILE_VERIFY_URL : DEFAULT_VERIFY_URL;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY.trim(), response: token, remoteip: ip }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return 'unavailable';
    const body = await res.json();
    return body.success === true ? 'ok' : 'failed';
  } catch {
    return 'unavailable';
  }
}

async function turnstileGuard(req, res, next) {
  if (!turnstileSiteKey()) return next();
  const token = req.body?.turnstileToken;
  // Cloudflare's tokens are at most 2048 characters.
  if (typeof token !== 'string' || token === '' || token.length > 2048) {
    return res.status(400).send(NEEDED);
  }
  const result = await verifyTurnstile(token, req.ip);
  if (result === 'failed') return res.status(400).send(NEEDED);
  if (result === 'unavailable') {
    // Fail open: a Cloudflare outage must not stop every signup; the other
    // checks still apply.
    logger.warn('turnstile: verification unavailable, letting the request through', { path: req.path });
  }
  next();
}

module.exports = { turnstileSiteKey, verifyTurnstile, turnstileGuard, TURNSTILE_NEEDED: NEEDED };
