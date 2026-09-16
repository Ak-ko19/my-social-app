const db = require('../db');
const { sendServerError } = require('../utils/sendError');

async function likePost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    const existingLike = await db.query(
      'SELECT * FROM likes WHERE post_id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (existingLike.rows.length > 0) {
      return res.status(400).send('You already liked this post');
    }
    await db.query(
      'INSERT INTO likes (post_id, user_id) VALUES ($1, $2)',
      [req.params.id, req.userId]
    );
    const postOwnerId = postCheck.rows[0].user_id;
    if (postOwnerId !== req.userId) {
      await db.query(
        'INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES ($1, $2, $3, $4)',
        [postOwnerId, req.userId, 'like', req.params.id]
      );
    }
    res.status(201).send('Post liked successfully');
  } catch (err) {
    sendServerError(res, err, 'Like post failed. Please try again later.');
  }
}

async function unlikePost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const result = await db.query(
      'DELETE FROM likes WHERE post_id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('You have not liked this post');
    }
    res.send('Post unliked successfully');
  } catch (err) {
    sendServerError(res, err, 'Unlike post failed. Please try again later.');
  }
}

async function getLikes(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const countResult = await db.query(
      'SELECT COUNT(*) FROM likes WHERE post_id = $1',
      [req.params.id]
    );
    res.json({ postId: req.params.id, likeCount: parseInt(countResult.rows[0].count) });
  } catch (err) {
    sendServerError(res, err, 'Fetch likes failed. Please try again later.');
  }
}

module.exports = { likePost, unlikePost, getLikes };
