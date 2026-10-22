// Day 77: one-time codes from an authenticator app (Google Authenticator,
// Microsoft Authenticator, 1Password, ...). TOTP, RFC 6238: HMAC-SHA1 of the
// number of 30-second steps since 1970 (RFC 4226 HOTP), 6 digits. These
// are the defaults every authenticator app reads from an otpauth:// link.
//
// Built on node's crypto -- no library, no outside service.
const crypto = require('crypto');

const STEP_SECONDS = 30;
const DIGITS = 6;
// A code from the step before or after also counts: phone clocks drift and
// typing takes time. Callers must refuse a step that was already used.
const WINDOW = 1;
const SECRET_BYTES = 20; // 160 bits, as RFC 4226 recommends

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

// Spaces, dashes, lower case and '=' padding are allowed (keys are often
// shown in groups). null for anything that isn't base32.
function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(SECRET_BYTES));
}

// RFC 4226 section 5.3: dynamic truncation of HMAC-SHA1(key, counter).
function hotp(key, counter, digits = DIGITS) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', key).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

const stepAt = (nowMs) => Math.floor(nowMs / 1000 / STEP_SECONDS);

// The code an app shows right now (tests use it to play the phone).
function codeAt(secret, nowMs = Date.now()) {
  return hotp(base32Decode(secret), stepAt(nowMs));
}

// The step a code belongs to, or null when it matches none in the window.
// Spaces in the code are fine ("123 456", as many apps show it). Every
// candidate is compared in constant time, and all of them are checked so
// the answer takes as long whichever one matched.
function verify(secret, code, nowMs = Date.now()) {
  const given = String(code ?? '').replace(/\s/g, '');
  if (!new RegExp(`^\\d{${DIGITS}}$`).test(given)) return null;
  const key = base32Decode(secret);
  if (!key) return null;
  const now = stepAt(nowMs);
  let matched = null;
  for (let step = now - WINDOW; step <= now + WINDOW; step++) {
    if (crypto.timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(given)) && matched === null) matched = step;
  }
  return matched;
}

// The link an authenticator app reads from the QR code
// (https://github.com/google/google-authenticator/wiki/Key-Uri-Format).
function otpauthUrl({ secret, account, issuer }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}

module.exports = { generateSecret, verify, codeAt, otpauthUrl, base32Encode, base32Decode, hotp, STEP_SECONDS, DIGITS, WINDOW };
