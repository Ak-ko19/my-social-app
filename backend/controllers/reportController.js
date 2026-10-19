const db = require('../db');
const { sendError } = require('../utils/httpError');
const { toUnicode } = require('../utils/myanmarText');

// Kept as an allowlist (not free text) so the reason column stays a small,
// analyzable set of values for a future moderation queue -- `details` is
// where free-text context goes instead.
const VALID_REASONS = ['spam', 'harassment', 'inappropriate_content', 'hate_speech', 'misinformation', 'other'];
const VALID_TARGET_TYPES = ['post', 'user', 'comment', 'message', 'community', 'page'];
const MAX_DETAILS_LENGTH = 500;
// Day 12: the reported text is kept as it was, so editing or unsending it
// afterwards doesn't erase the evidence.
const MAX_SNAPSHOT_LENGTH = 1000;
const snapshotOf = (text) => (text ? text.slice(0, MAX_SNAPSHOT_LENGTH) : null);

async function createReport(req, res) {
  try {
    const { targetType, targetId, reason } = req.body;
    // Day 43: Zawgyi Myanmar text stored as Unicode (cut first, so the
    // conversion's work stays bounded).
    const details = toUnicode((req.body.details || '').trim().slice(0, MAX_DETAILS_LENGTH));

    if (!VALID_TARGET_TYPES.includes(targetType)) {
      return res.status(400).send('targetType must be "post", "user", "comment", "message", "community" or "page"');
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
    let ownerId = null;
    let snapshot = null;
    if (targetType === 'post') {
      const postCheck = await db.query('SELECT user_id, content FROM posts WHERE id = $1', [parsedTargetId]);
      if (postCheck.rows.length === 0) {
        return res.status(404).send('Post not found');
      }
      if (postCheck.rows[0].user_id === req.userId) {
        return res.status(400).send('You cannot report your own post');
      }
      ownerId = postCheck.rows[0].user_id;
      snapshot = snapshotOf(postCheck.rows[0].content);
    } else if (targetType === 'comment') {
      const commentCheck = await db.query('SELECT user_id, content FROM comments WHERE id = $1', [parsedTargetId]);
      if (commentCheck.rows.length === 0) {
        return res.status(404).send('Comment not found');
      }
      if (commentCheck.rows[0].user_id === req.userId) {
        return res.status(400).send('You cannot report your own comment');
      }
      ownerId = commentCheck.rows[0].user_id;
      snapshot = snapshotOf(commentCheck.rows[0].content);
    } else if (targetType === 'message') {
      // Only someone in the conversation can report one of its messages;
      // anyone else gets the same 404 as for a message that doesn't exist,
      // so other people's chats can't even be probed.
      const messageCheck = await db.query(
        `SELECT m.sender_id, m.content, m.deleted_at FROM messages m
         JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $2
         WHERE m.id = $1`,
        [parsedTargetId, req.userId]
      );
      const message = messageCheck.rows[0];
      if (!message || message.deleted_at) {
        return res.status(404).send('Message not found');
      }
      if (message.sender_id === req.userId) {
        return res.status(400).send('You cannot report your own message');
      }
      ownerId = message.sender_id;
      snapshot = snapshotOf(message.content); // a voice note: none; a photo: its caption
    } else if (targetType === 'community') {
      // Day 24: a private group can only be reported by its members --
      // anyone else gets the same 404 as a group that doesn't exist.
      const groupCheck = await db.query(
        `SELECT c.name, c.description, c.created_by, c.privacy,
           EXISTS(SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = $2 AND cm.status = 'member') AS is_member
         FROM communities c WHERE c.id = $1`,
        [parsedTargetId, req.userId]
      );
      const group = groupCheck.rows[0];
      if (!group || (group.privacy === 'private' && !group.is_member)) {
        return res.status(404).send('Group not found');
      }
      if (group.created_by === req.userId) {
        return res.status(400).send('You cannot report your own group');
      }
      ownerId = group.created_by;
      snapshot = snapshotOf([group.name, group.description].filter(Boolean).join(' — '));
    } else if (targetType === 'page') {
      const pageCheck = await db.query('SELECT name, description, owner_id FROM pages WHERE id = $1', [parsedTargetId]);
      const page = pageCheck.rows[0];
      if (!page) {
        return res.status(404).send('Page not found');
      }
      if (page.owner_id === req.userId) {
        return res.status(400).send('You cannot report your own page');
      }
      ownerId = page.owner_id;
      snapshot = snapshotOf([page.name, page.description].filter(Boolean).join(' — '));
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
      `INSERT INTO reports (reporter_id, target_type, target_id, reason, details, target_owner_id, target_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, targetType, parsedTargetId, reason, details || null, ownerId, snapshot]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Report submission failed. Please try again later.');
  }
}

module.exports = { createReport, VALID_REASONS };
