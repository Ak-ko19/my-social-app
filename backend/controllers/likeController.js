const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getVisiblePost } = require('../services/postVisibilityService');

async function likePost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    // Same visibility rules as GET /posts/:id -- see postVisibilityService.
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
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
    const postOwnerId = post.user_id;
    if (postOwnerId !== req.userId) {
      await db.query(
        'INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES ($1, $2, $3, $4)',
        [postOwnerId, req.userId, 'like', req.params.id]
      );
    }
    // Returns the authoritative count so the frontend's optimistic UI can
    // reconcile instead of just trusting its own local +1/-1 math.
    const countResult = await db.query('SELECT COUNT(*)::int AS count FROM likes WHERE post_id = $1', [req.params.id]);
    res.status(201).json({ message: 'Post liked successfully', likeCount: countResult.rows[0].count });
  } catch (err) {
    // A concurrent request (e.g. a double-click across two tabs) can slip
    // past the existingLike check above before either INSERT commits --
    // likes has a UNIQUE(post_id, user_id) constraint specifically to catch
    // that, so the loser here isn't a real failure, just the same conflict
    // the check above already handles. Same status/message either way, so
    // the frontend's optimistic UI (which matches on this exact message)
    // reconciles it the same way regardless of which path caught it.
    if (err.code === '23505') {
      return res.status(400).send('You already liked this post');
    }
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
    const countResult = await db.query('SELECT COUNT(*)::int AS count FROM likes WHERE post_id = $1', [req.params.id]);
    res.json({ message: 'Post unliked successfully', likeCount: countResult.rows[0].count });
  } catch (err) {
    sendServerError(res, err, 'Unlike post failed. Please try again later.');
  }
}

async function getLikes(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    // Same visibility rules as GET /posts/:id -- see postVisibilityService.
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
      return res.status(404).send('Post not found');
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
