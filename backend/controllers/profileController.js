const db = require('../db');
const { sendServerError } = require('../utils/sendError');

async function getMyProfile(req, res) {
  try {
    const result = await db.query('SELECT id, username, email, bio, avatar_url, created_at FROM users WHERE id = $1', [req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err, 'Error fetching profile. Please try again later.');
  }
}

async function getProfile(req, res) {
  try {
    const { id } = req.params;
    // Public profile endpoint (no auth) — deliberately excludes email; see getMyProfile for the owner-only view.
    const result = await db.query('SELECT id, username, bio, avatar_url, created_at FROM users WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err, 'Error fetching profile. Please try again later.');
  }
}

async function updateProfile(req, res) {
  try {
    const { username, email, bio } = req.body;
    if (!username || !email) {
      return res.status(400).send('Username and email are required');
    }
    const avatarUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await db.query(
      'UPDATE users SET username = $1, email = $2, bio = $3, avatar_url = COALESCE($4, avatar_url) WHERE id = $5 RETURNING id, username, email, bio, avatar_url, created_at',
      [username, email, bio || null, avatarUrl, req.userId]
    );
    res.status(200).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).send('Email or username already exists');
    }
    sendServerError(res, err, 'Update profile failed. Please try again later.');
  }
}

module.exports = { getMyProfile, getProfile, updateProfile };
