const db = require('../db');
const { sendServerError } = require('../utils/sendError');

// Kept as an allowlist (not free text) so the reason column stays a small,
// analyzable set of values for a future moderation queue -- `details` is
// where free-text context goes instead.
const VALID_REASONS = ['spam', 'harassment', 'inappropriate_content', 'hate_speech', 'misinformation', 'other'];
const VALID_TARGET_TYPES = ['post', 'user'];
const MAX_DETAILS_LENGTH = 500;

async function createReport(req, res) {
  try {
    const { targetType, targetId, reason } = req.body;
    const details = (req.body.details || '').trim().slice(0, MAX_DETAILS_LENGTH);

    if (!VALID_TARGET_TYPES.includes(targetType)) {
      return res.status(400).send('targetType must be "post" or "user"');
    }
    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).send(`reason must be one of: ${VALID_REASONS.join(', ')}`);
    }
    const parsedTargetId = parseInt(targetId, 10);
    if (isNaN(parsedTargetId)) {
      return res.status(400).send('A valid targetId is required');
    }

    // Branched rather than interpolating the table name into the query --
    // targetType is already allowlist-validated above, but a literal query
    // per branch keeps this un-parameterizable piece impossible to get
    // wrong later even if that validation ever changes.
    if (targetType === 'post') {
      const postCheck = await db.query('SELECT user_id FROM posts WHERE id = $1', [parsedTargetId]);
      if (postCheck.rows.length === 0) {
        return res.status(404).send('Post not found');
      }
      if (postCheck.rows[0].user_id === req.userId) {
        return res.status(400).send('You cannot report your own post');
      }
    } else {
      if (parsedTargetId === req.userId) {
        return res.status(400).send('You cannot report yourself');
      }
      const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [parsedTargetId]);
      if (userCheck.rows.length === 0) {
        return res.status(404).send('User not found');
      }
    }

    const result = await db.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.userId, targetType, parsedTargetId, reason, details || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err, 'Report submission failed. Please try again later.');
  }
}

module.exports = { createReport, VALID_REASONS };
