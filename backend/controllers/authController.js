const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { sendServerError } = require('../utils/sendError');

const JWT_SECRET = process.env.JWT_SECRET;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// NIST 800-63B: require a reasonable minimum length, not forced complexity
// rules (those push people toward predictable patterns like "Passw0rd!").
// Max is bcrypt's own limit -- it silently truncates and ignores anything
// past 72 bytes, so a longer password would appear accepted while actually
// only the first 72 bytes mattered.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

function isPasswordValid(password) {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}

// Precomputed at startup so bcrypt.compare always runs against a real hash,
// even when the email doesn't exist -- keeps login response time
// indistinguishable between "no such user" and "wrong password", closing
// the timing side-channel that a status-only fix wouldn't.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password-used-only-for-timing', 10);

// Reset tokens are high-entropy (256-bit) random values, so a fast
// cryptographic hash (not bcrypt) is the right tool -- bcrypt's slow KDF
// exists to slow down guessing low-entropy secrets, which doesn't apply
// here. Storing only the hash means a DB leak doesn't hand out usable
// reset tokens, the same way we never store plaintext passwords.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function signup(req, res) {
  try {
    const username = (req.body.username || '').trim();
    const email = (req.body.email || '').trim();
    const password = req.body.password || '';

    if (!username || !email || !password) {
      return res.status(400).send('Username, email, and password are all required');
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).send('Please enter a valid email address');
    }
    if (!isPasswordValid(password)) {
      return res.status(400).send(`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters long`);
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).send('Email or username already exists');
    }
    sendServerError(res, err, 'Signup failed. Please try again later.');
  }
}

async function login(req, res) {
  try {
    const email = (req.body.email || '').trim();
    const password = req.body.password || '';

    if (!email || !password) {
      return res.status(400).send('Email and password are required');
    }
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user ? user.password : DUMMY_PASSWORD_HASH);

    if (!user || !isMatch) {
      return res.status(401).send('Invalid email or password');
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({ token, id: user.id, username: user.username, email: user.email });
  } catch (err) {
    sendServerError(res, err, 'Login failed. Please try again later.');
  }
}

async function forgotPassword(req, res) {
  try {
    const email = (req.body.email || '').trim();
    if (!email) {
      return res.status(400).send('Email is required');
    }

    const genericMessage = 'If that email exists, a password reset link has been sent';
    const result = await db.query('SELECT id FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(200).send(genericMessage);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
      [hashToken(token), expiry, result.rows[0].id]
    );

    console.log(`Reset link: http://localhost:5173/reset-password/${token}`);
    res.status(200).send(genericMessage);
  } catch (err) {
    sendServerError(res, err, 'Forgot password failed. Please try again later.');
  }
}

async function resetPassword(req, res) {
  try {
    const { token } = req.params;
    const password = req.body.password || '';

    if (!password) {
      return res.status(400).send('New password is required');
    }
    if (!isPasswordValid(password)) {
      return res.status(400).send(`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters long`);
    }

    const result = await db.query(
      'SELECT id, reset_token_expiry FROM users WHERE reset_token = $1',
      [hashToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(400).send('Link expired or invalid');
    }

    const user = result.rows[0];
    if (!user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
      return res.status(400).send('Link expired or invalid');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
      [hashedPassword, user.id]
    );

    res.status(200).send('Password reset successfully');
  } catch (err) {
    sendServerError(res, err, 'Reset password failed. Please try again later.');
  }
}

module.exports = { signup, login, forgotPassword, resetPassword };
