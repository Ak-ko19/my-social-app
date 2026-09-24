const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const mentionService = require('../services/mentionService');
const { getVisiblePost } = require('../services/postVisibilityService');

async function createComment(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).send('Comment cannot be empty');
    }
    // Same visibility rules as GET /posts/:id -- see postVisibilityService.
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
      return res.status(404).send('Post not found');
    }
    const result = await db.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, req.userId, content]
    );
    const postOwnerId = post.user_id;
    if (postOwnerId !== req.userId) {
      await db.query(
        'INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id) VALUES ($1, $2, $3, $4, $5)',
        [postOwnerId, req.userId, 'comment', req.params.id, result.rows[0].id]
      );
    }
    await mentionService.notifyMentions({
      content,
      authorId: req.userId,
      postId: parseInt(req.params.id, 10),
      commentId: result.rows[0].id
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err, 'Create comment failed. Please try again later.');
  }
}

async function getComments(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    // Same visibility rules as GET /posts/:id -- see postVisibilityService.
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
      return res.status(404).send('Post not found');
    }
    // Also hide individual comments from anyone the viewer has a block with
    // (either direction), same mutual-invisibility rule as everywhere else.
    const viewerId = req.userId ?? null;
    const result = await db.query(`
      SELECT comments.id, comments.content, comments.created_at, users.id AS user_id, users.username
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.post_id = $1
        AND ($2::int IS NULL OR NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocks.blocker_id = $2 AND blocks.blocked_id = comments.user_id)
             OR (blocks.blocker_id = comments.user_id AND blocks.blocked_id = $2)
        ))
      ORDER BY comments.created_at ASC
    `, [req.params.id, viewerId]);
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err, 'Fetch comments failed. Please try again later.');
  }
}

async function updateComment(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid comment ID');
    }
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).send('Comment cannot be empty');
    }
    const commentCheck = await db.query('SELECT * FROM comments WHERE id = $1', [req.params.id]);
    if (commentCheck.rows.length === 0) {
      return res.status(404).send('Comment not found');
    }
    if (commentCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only edit your own comments');
    }
    const result = await db.query(
      'UPDATE comments SET content = $1 WHERE id = $2 RETURNING *',
      [content, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err, 'Update comment failed. Please try again later.');
  }
}

async function deleteComment(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid comment ID');
    }
    const commentCheck = await db.query('SELECT * FROM comments WHERE id = $1', [req.params.id]);
    if (commentCheck.rows.length === 0) {
      return res.status(404).send('Comment not found');
    }
    if (commentCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only delete your own comments');
    }
    await db.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
    res.send('Comment deleted successfully');
  } catch (err) {
    sendServerError(res, err, 'Delete comment failed. Please try again later.');
  }
}

module.exports = { createComment, getComments, updateComment, deleteComment };
