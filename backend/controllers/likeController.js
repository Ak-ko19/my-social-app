const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getVisiblePost } = require('../services/postVisibilityService');
const communityService = require('../services/communityService');
const reactionService = require('../services/reactionService');
const notificationService = require('../services/notificationService');

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
    // Day 50: only members comment and react in a group.
    try {
      communityService.assertCanInteract(post);
    } catch (err) {
      if (err instanceof communityService.GroupRuleError) return res.status(err.status).send(err.message);
      throw err;
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
      await notificationService.notify({ userId: postOwnerId, actorId: req.userId, type: 'like', postId: post.id });
    }
    // Returns the authoritative count so the frontend's optimistic UI can
    // reconcile instead of just trusting its own local +1/-1 math.
    const summary = await reactionService.getReactionSummary(req.params.id);
    res.status(201).json({ message: 'Post liked successfully', myReaction: 'like', ...summary });
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
    const summary = await reactionService.getReactionSummary(req.params.id);
    res.json({ message: 'Post unliked successfully', myReaction: null, ...summary });
  } catch (err) {
    sendServerError(res, err, 'Unlike post failed. Please try again later.');
  }
}

// PUT /posts/:id/reaction { reaction } -- sets OR changes the viewer's
// reaction (idempotent; unlike POST /like, which 400s if one already
// exists). Removing a reaction is still DELETE /posts/:id/like.
// Notifies the author only when a reaction is first added, not on every
// change, so switching like -> love -> haha doesn't spam them.
async function setReaction(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const { reaction } = req.body;
    if (!reactionService.isValidReaction(reaction)) {
      return res.status(400).send(`reaction must be one of: ${reactionService.REACTIONS.join(', ')}`);
    }
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
      return res.status(404).send('Post not found');
    }
    // Day 50: only members comment and react in a group.
    try {
      communityService.assertCanInteract(post);
    } catch (err) {
      if (err instanceof communityService.GroupRuleError) return res.status(err.status).send(err.message);
      throw err;
    }

    // xmax = 0 only for a freshly inserted row -- distinguishes 'added'
    // from 'changed' in one atomic upsert (no check-then-insert race).
    const result = await db.query(
      `INSERT INTO likes (post_id, user_id, reaction) VALUES ($1, $2, $3)
       ON CONFLICT (post_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction
       RETURNING (xmax = 0) AS inserted`,
      [req.params.id, req.userId, reaction]
    );
    const inserted = result.rows[0].inserted;

    if (inserted && post.user_id !== req.userId) {
      await notificationService.notify({ userId: post.user_id, actorId: req.userId, type: 'like', postId: post.id });
    }

    const summary = await reactionService.getReactionSummary(req.params.id);
    res.status(inserted ? 201 : 200).json({ myReaction: reaction, ...summary });
  } catch (err) {
    sendServerError(res, err, 'Reaction failed. Please try again later.');
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
    const summary = await reactionService.getReactionSummary(req.params.id);
    res.json({ postId: req.params.id, ...summary });
  } catch (err) {
    sendServerError(res, err, 'Fetch likes failed. Please try again later.');
  }
}

module.exports = { likePost, unlikePost, setReaction, getLikes };
