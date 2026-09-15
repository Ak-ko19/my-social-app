const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (password.length < 6) {
      return res.status(400).send('Password must be at least 6 characters long');
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
    res.status(500).send('Signup failed: ' + err.message);
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

    if (result.rows.length === 0) {
      return res.status(400).send('User not found');
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).send('Incorrect password');
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({ token, id: user.id, username: user.username, email: user.email });
  } catch (err) {
    res.status(500).send('Login failed: ' + err.message);
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
      [token, expiry, result.rows[0].id]
    );

    console.log(`Reset link: http://localhost:5173/reset-password/${token}`);
    res.status(200).send(genericMessage);
  } catch (err) {
    res.status(500).send('Forgot password failed: ' + err.message);
  }
}

async function resetPassword(req, res) {
  try {
    const { token } = req.params;
    const password = req.body.password || '';

    if (!password) {
      return res.status(400).send('New password is required');
    }
    if (password.length < 6) {
      return res.status(400).send('Password must be at least 6 characters long');
    }

    const result = await db.query(
      'SELECT id, reset_token_expiry FROM users WHERE reset_token = $1',
      [token]
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
    res.status(500).send('Reset password failed: ' + err.message);
  }
}

module.exports = { signup, login, forgotPassword, resetPassword };
