const db = require('../db');

async function getMyProfile(req, res) {
  try {
    const result = await db.query('SELECT id, username, email, bio, avatar_url, created_at FROM users WHERE id = $1', [req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Error fetching profile: ' + err.message);
  }
}

async function getProfile(req, res) {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT id, username, email, bio, avatar_url, created_at FROM users WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Error fetching profile: ' + err.message);
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
    res.status(500).send('Update profile failed: ' + err.message);
  }
}

module.exports = { getMyProfile, getProfile, updateProfile };
