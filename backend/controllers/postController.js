const db = require('../db');

async function createPost(req, res) {
  try {
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).send('Post content cannot be empty');
    }
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await db.query(
      'INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, content, imageUrl]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Create post failed: ' + err.message);
  }
}

async function getPosts(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT posts.id, posts.content, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url
      FROM posts
      JOIN users ON posts.user_id = users.id
      ORDER BY posts.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await db.query('SELECT COUNT(*) FROM posts');
    const totalPosts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalPosts / limit);

    res.json({
      posts: result.rows,
      currentPage: page,
      totalPages: totalPages,
      totalPosts: totalPosts
    });
  } catch (err) {
    res.status(500).send('Fetch posts failed: ' + err.message);
  }
}

async function getFeed(req, res) {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const feedQuery = `
      SELECT posts.*, users.username, users.avatar_url
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = $1
      )
      ORDER BY posts.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(feedQuery, [userId, limit, offset]);

    res.status(200).json({
      page: page,
      limit: limit,
      posts: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getPost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const result = await db.query(`
      SELECT posts.id, posts.content, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Fetch post failed: ' + err.message);
  }
}

async function updatePost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const { content } = req.body;
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    if (postCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only edit your own posts');
    }
    const result = await db.query(
      'UPDATE posts SET content = $1 WHERE id = $2 RETURNING *',
      [content, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Update post failed: ' + err.message);
  }
}

async function deletePost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    if (postCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only delete your own posts');
    }
    await db.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.send('Post deleted successfully');
  } catch (err) {
    res.status(500).send('Delete post failed: ' + err.message);
  }
}

module.exports = { createPost, getPosts, getFeed, getPost, updatePost, deletePost };
