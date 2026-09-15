const db = require('../db');

async function searchUsers(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).send('Search query is required');
    }
    const result = await db.query(
      'SELECT id, username, bio, avatar_url FROM users WHERE username ILIKE $1 ORDER BY username ASC LIMIT 20',
      [`%${q}%`]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).send('Search users failed: ' + err.message);
  }
}

async function searchPosts(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).send('Search query is required');
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT posts.id, posts.content, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.content ILIKE $1
      ORDER BY posts.created_at DESC
      LIMIT $2 OFFSET $3
    `, [`%${q}%`, limit, offset]);

    res.status(200).json({ page, limit, posts: result.rows });
  } catch (err) {
    res.status(500).send('Search posts failed: ' + err.message);
  }
}

module.exports = { searchUsers, searchPosts };
