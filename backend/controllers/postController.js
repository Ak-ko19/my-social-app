const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');

async function createPost(req, res) {
  try {
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).send('Post content cannot be empty');
    }
    const imageUrl = req.cloudinaryResult ? req.cloudinaryResult.secure_url : null;
    const result = await db.query(
      'INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, content, imageUrl]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err, 'Create post failed. Please try again later.');
  }
}

async function getPosts(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });

    // Fetch one extra row instead of running a separate COUNT(*) -- a
    // full-table count gets slower as the table grows and every request
    // was paying for it. hasMore is all a feed UI actually needs.
    const result = await db.query(`
      SELECT posts.id, posts.content, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url
      FROM posts
      JOIN users ON posts.user_id = users.id
      ORDER BY posts.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit + 1, offset]);

    const hasMore = result.rows.length > limit;
    const posts = hasMore ? result.rows.slice(0, limit) : result.rows;

    res.json({
      posts,
      currentPage: page,
      hasMore
    });
  } catch (err) {
    sendServerError(res, err, 'Fetch posts failed. Please try again later.');
  }
}

async function getFeed(req, res) {
  try {
    const userId = req.userId;
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });

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
    sendServerError(res, err, 'Fetch post failed. Please try again later.');
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
    sendServerError(res, err, 'Update post failed. Please try again later.');
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
    sendServerError(res, err, 'Delete post failed. Please try again later.');
  }
}

module.exports = { createPost, getPosts, getFeed, getPost, updatePost, deletePost };
