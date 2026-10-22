// Day 77: two-factor authentication with an authenticator app (TOTP,
// utils/totp.js), like Facebook's and Instagram's "authentication app"
// option. Setting it up: the app scans a QR code (or the key is typed in),
// then one code from it confirms the app works, and 10 one-time recovery
// codes are shown once, for a lost phone. From then on a login needs the
// password AND a code (controllers/authController.js).
//
// Guessing: a 6-digit code (3 steps accepted) is only safe if guesses are
// few. Every check counts as an attempt BEFORE it is made, in the users
// row (so all server instances share the count, and parallel guesses
// can't slip past it); more than MAX_ATTEMPTS wrong ones in 15 minutes and
// codes are refused until the window ends. A right code clears the count.
//
// The secret is stored as is: encrypting it needs a key the owner sets
// (LATER.md). It is only ever sent back during setup.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const db = require('../db');
const logger = require('../utils/logger');
const email = require('../utils/email'); // called through the module, so tests can watch it
const { emailText } = require('../config/emailText');
const { HttpError } = require('../utils/httpError');
const totp = require('../utils/totp');

class TwoFactorError extends HttpError {}

const ISSUER = 'MySocialApp';
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW = '15 minutes';
const RECOVERY_CODE_COUNT = 10;
// No 0/o, 1/l/i: codes are often written down on paper.
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const RECOVERY_LENGTH = 10;

const ALREADY_ON = 'Two-factor authentication is already on.';
const NOT_ON = 'Two-factor authentication is off.';
const NO_SETUP = 'Set up two-factor authentication first.';
const CODE_REQUIRED = 'Enter the 6-digit code from your authenticator app.';
const WRONG_CODE = 'That code is not right. Check that the time on your phone is correct and try again.';
const USED_CODE = 'That code was already used. Wait for the next one in your app.';
const WRONG_RECOVERY = 'That recovery code is not right, or it was already used.';
const TOO_MANY = 'Too many wrong codes. Please wait 15 minutes and try again.';
const PASSWORD_REQUIRED = 'Password is required.';

const hashCode = (code) => crypto.createHash('sha256').update(code).digest('hex');
// "ABCDE-fghij", "abcde fghij" -> "abcdefghij"
const normalizeRecoveryCode = (code) => String(code ?? '').toLowerCase().replace(/[\s-]/g, '');

function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    let code = '';
    for (let i = 0; i < RECOVERY_LENGTH; i++) code += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

// Re-entering the password guards every change (a stolen, still-open
// session alone can't turn 2FA off or read the recovery codes). 403, not
// 401: the app logs out on any 401.
async function checkPassword(userId, password) {
  if (!password) throw new TwoFactorError(400, PASSWORD_REQUIRED);
  const row = (await db.query('SELECT password FROM users WHERE id = $1', [userId])).rows[0];
  if (!row) throw new TwoFactorError(404, 'User not found');
  if (!(await bcrypt.compare(password, row.password))) throw new TwoFactorError(403, 'Incorrect password');
}

async function status(userId) {
  const row = (await db.query(
    `SELECT u.totp_enabled_at,
            (SELECT count(*)::int FROM recovery_codes r WHERE r.user_id = u.id AND r.used_at IS NULL) AS codes_left
     FROM users u WHERE u.id = $1`,
    [userId]
  )).rows[0];
  if (!row) throw new TwoFactorError(404, 'User not found');
  return {
    enabled: row.totp_enabled_at !== null,
    enabledAt: row.totp_enabled_at,
    recoveryCodesLeft: row.totp_enabled_at ? row.codes_left : 0
  };
}

// Step one: a fresh key (replacing any earlier unfinished setup) and the
// QR code that carries it. Nothing is on until enable() gets a code.
async function startSetup(userId) {
  const row = (await db.query('SELECT username, totp_enabled_at FROM users WHERE id = $1', [userId])).rows[0];
  if (!row) throw new TwoFactorError(404, 'User not found');
  if (row.totp_enabled_at) throw new TwoFactorError(409, ALREADY_ON);
  const secret = totp.generateSecret();
  await db.query('UPDATE users SET totp_pending_secret = $1 WHERE id = $2', [secret, userId]);
  const otpauthUrl = totp.otpauthUrl({ secret, account: row.username, issuer: ISSUER });
  // An SVG built here, so the web app needs no QR library of its own.
  const svg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
  return { secret, otpauthUrl, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
}

// Counts this attempt first; refuses it when the account is over the
// limit. The count starts again once a window has passed.
async function takeAttempt(client, userId) {
  const row = (await client.query(
    `UPDATE users SET
       totp_failures = CASE WHEN totp_failures_since IS NULL OR totp_failures_since < now() - interval '${ATTEMPT_WINDOW}'
                            THEN 1 ELSE totp_failures + 1 END,
       totp_failures_since = CASE WHEN totp_failures_since IS NULL OR totp_failures_since < now() - interval '${ATTEMPT_WINDOW}'
                                  THEN now() ELSE totp_failures_since END
     WHERE id = $1 RETURNING totp_failures`,
    [userId]
  )).rows[0];
  if (!row) throw new TwoFactorError(404, 'User not found');
  if (row.totp_failures > MAX_ATTEMPTS) throw new TwoFactorError(429, TOO_MANY);
}

const clearAttempts = (client, userId) =>
  client.query('UPDATE users SET totp_failures = 0, totp_failures_since = NULL WHERE id = $1', [userId]);

// Accepts a code for `secret` at most once: the step is recorded only if
// it is newer than the last one used, in one statement, so two requests
// with the same code can't both pass.
async function useTotpCode(client, userId, secret, code) {
  const step = totp.verify(secret, code);
  if (step === null) throw new TwoFactorError(400, WRONG_CODE);
  const updated = await client.query(
    'UPDATE users SET totp_last_step = $2 WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2) RETURNING id',
    [userId, step]
  );
  if (updated.rows.length === 0) throw new TwoFactorError(400, USED_CODE);
}

async function useRecoveryCode(client, userId, code) {
  const clean = normalizeRecoveryCode(code);
  const used = clean.length === RECOVERY_LENGTH && (await client.query(
    'UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id',
    [userId, hashCode(clean)]
  )).rows.length > 0;
  if (!used) throw new TwoFactorError(400, WRONG_RECOVERY);
}

// The second factor for an account with 2FA on: a code from the app, or
// one of the recovery codes. Returns which one was used ('app' |
// 'recovery'). Used by turning 2FA off and by the login step.
async function checkSecondFactor(userId, { code, recoveryCode }) {
  const row = (await db.query('SELECT totp_secret, totp_enabled_at FROM users WHERE id = $1', [userId])).rows[0];
  if (!row) throw new TwoFactorError(404, 'User not found');
  if (!row.totp_enabled_at) throw new TwoFactorError(400, NOT_ON);
  if (!code && !recoveryCode) throw new TwoFactorError(400, CODE_REQUIRED);
  await takeAttempt(db, userId);
  if (code) await useTotpCode(db, userId, row.totp_secret, code);
  else await useRecoveryCode(db, userId, recoveryCode);
  await clearAttempts(db, userId);
  return code ? 'app' : 'recovery';
}

async function replaceRecoveryCodes(client, userId) {
  const codes = newRecoveryCodes();
  await client.query('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
  await client.query(
    'INSERT INTO recovery_codes (user_id, code_hash) SELECT $1, unnest($2::char(64)[])',
    [userId, codes.map((c) => hashCode(normalizeRecoveryCode(c)))]
  );
  return codes;
}

// Tells the owner by email (when email is set up) that 2FA was turned on
// or off -- someone in their account turning it off is exactly what they
// need to hear about. Never fails the change itself.
function emailChange(userId, key) {
  if (!email.emailEnabled()) return;
  db.query('SELECT email, language FROM users WHERE id = $1', [userId])
    .then(({ rows }) => rows[0] && email.sendEmail({ to: rows[0].email, ...emailText(rows[0].language, key, {}) }))
    .catch((err) => logger.error('two-factor email failed', { userId, err }));
}

// Step two: a code from the app proves it holds the key. Turns 2FA on and
// returns the recovery codes (the only time they are shown).
async function enable(userId, code) {
  if (!code) throw new TwoFactorError(400, CODE_REQUIRED);
  const row = (await db.query('SELECT totp_pending_secret, totp_enabled_at FROM users WHERE id = $1', [userId])).rows[0];
  if (!row) throw new TwoFactorError(404, 'User not found');
  if (row.totp_enabled_at) throw new TwoFactorError(409, ALREADY_ON);
  if (!row.totp_pending_secret) throw new TwoFactorError(400, NO_SETUP);
  await takeAttempt(db, userId);
  const step = totp.verify(row.totp_pending_secret, code);
  if (step === null) throw new TwoFactorError(400, WRONG_CODE);

  const client = await db.connect();
  let codes;
  try {
    await client.query('BEGIN');
    // Only if nothing changed meanwhile (a second setup, or a parallel enable).
    const turnedOn = await client.query(
      `UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled_at = now(),
              totp_last_step = $3, totp_failures = 0, totp_failures_since = NULL
       WHERE id = $1 AND totp_pending_secret = $2 AND totp_enabled_at IS NULL RETURNING id`,
      [userId, row.totp_pending_secret, step]
    );
    if (turnedOn.rows.length === 0) throw new TwoFactorError(409, ALREADY_ON);
    codes = await replaceRecoveryCodes(client, userId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  emailChange(userId, 'twoFactorOn');
  return codes;
}

async function disable(userId, { code, recoveryCode }) {
  await checkSecondFactor(userId, { code, recoveryCode });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
              totp_failures = 0, totp_failures_since = NULL
       WHERE id = $1`,
      [userId]
    );
    await client.query('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  emailChange(userId, 'twoFactorOff');
}

// New recovery codes; the old ones stop working.
async function regenerateRecoveryCodes(userId) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const on = await client.query('SELECT 1 FROM users WHERE id = $1 AND totp_enabled_at IS NOT NULL FOR UPDATE', [userId]);
    if (on.rows.length === 0) throw new TwoFactorError(400, NOT_ON);
    const codes = await replaceRecoveryCodes(client, userId);
    await client.query('COMMIT');
    return codes;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  checkPassword,
  status,
  startSetup,
  enable,
  disable,
  checkSecondFactor,
  regenerateRecoveryCodes,
  normalizeRecoveryCode,
  TwoFactorError,
  MAX_ATTEMPTS,
  RECOVERY_CODE_COUNT
};
