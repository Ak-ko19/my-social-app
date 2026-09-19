const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { encodeCursor, decodeCursor, getLimit } = require('../utils/cursorPagination');
const messageService = require('../services/messageService');
const { getIO } = require('../sockets');

async function getConversations(req, res) {
  try {
    // Assumes exactly 2 participants per conversation (type = 'direct' --
    // the only kind this app creates today). Listing group conversations
    // will need a different shape once groups are actually built.
    const result = await db.query(`
      SELECT
        c.id AS conversation_id,
        other.id AS other_user_id,
        other.username,
        other.avatar_url,
        lm.content AS last_message,
        lm.created_at AS last_message_at,
        COALESCE(unread.count, 0)::int AS unread_count
      FROM conversation_participants cp
      JOIN conversations c ON c.id = cp.conversation_id AND c.type = 'direct'
      JOIN conversation_participants other_cp
        ON other_cp.conversation_id = c.id AND other_cp.user_id != cp.user_id
      JOIN users other ON other.id = other_cp.user_id
      LEFT JOIN LATERAL (
        SELECT content, created_at
        FROM messages m
        WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id != $1
          AND m.deleted_at IS NULL
          AND (cp.last_read_message_id IS NULL OR m.id > cp.last_read_message_id)
      ) unread ON true
      WHERE cp.user_id = $1
      ORDER BY COALESCE(lm.created_at, c.created_at) DESC
    `, [req.userId]);

    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err, 'Fetch conversations failed. Please try again later.');
  }
}

async function createConversation(req, res) {
  try {
    const targetUserId = parseInt(req.body.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).send('A valid userId is required');
    }
    if (targetUserId === req.userId) {
      return res.status(400).send('You cannot start a conversation with yourself');
    }

    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const userAId = Math.min(req.userId, targetUserId);
    const userBId = Math.max(req.userId, targetUserId);

    const existing = await db.query(
      `SELECT * FROM conversations WHERE type = 'direct' AND user_a_id = $1 AND user_b_id = $2`,
      [userAId, userBId]
    );
    if (existing.rows.length > 0) {
      const other = await db.query('SELECT id, username, avatar_url FROM users WHERE id = $1', [targetUserId]);
      return res.status(200).json({
        ...existing.rows[0],
        other_user_id: other.rows[0].id,
        username: other.rows[0].username,
        avatar_url: other.rows[0].avatar_url
      });
    }

    const created = await db.query(
      `INSERT INTO conversations (type, user_a_id, user_b_id) VALUES ('direct', $1, $2) RETURNING *`,
      [userAId, userBId]
    );
    const conversation = created.rows[0];

    await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
      [conversation.id, req.userId, targetUserId]
    );

    const other = await db.query('SELECT id, username, avatar_url FROM users WHERE id = $1', [targetUserId]);

    res.status(201).json({
      ...conversation,
      other_user_id: other.rows[0].id,
      username: other.rows[0].username,
      avatar_url: other.rows[0].avatar_url
    });
  } catch (err) {
    // A concurrent request (e.g. the other user opening the same DM at the
    // same moment) can race past the existing-conversation check above and
    // hit idx_conversations_direct_unique_pair -- same case that check
    // handles, not a real failure, so just return the conversation it raced with.
    if (err.code === '23505') {
      const targetUserId = parseInt(req.body.userId);
      const userAId = Math.min(req.userId, targetUserId);
      const userBId = Math.max(req.userId, targetUserId);
      const existing = await db.query(
        `SELECT * FROM conversations WHERE type = 'direct' AND user_a_id = $1 AND user_b_id = $2`,
        [userAId, userBId]
      );
      const other = await db.query('SELECT id, username, avatar_url FROM users WHERE id = $1', [targetUserId]);
      return res.status(200).json({
        ...existing.rows[0],
        other_user_id: other.rows[0].id,
        username: other.rows[0].username,
        avatar_url: other.rows[0].avatar_url
      });
    }
    sendServerError(res, err, 'Create conversation failed. Please try again later.');
  }
}

async function getMessages(req, res) {
  try {
    const conversationId = parseInt(req.params.id);
    if (isNaN(conversationId)) {
      return res.status(400).send('Invalid conversation ID');
    }

    if (!(await messageService.isParticipant(conversationId, req.userId))) {
      return res.status(403).send('You are not a participant in this conversation');
    }

    const limit = getLimit(req, { defaultLimit: 20, maxLimit: 100 });
    let cursor;
    try {
      cursor = decodeCursor(req.query.cursor);
    } catch (err) {
      return res.status(400).send('Invalid cursor');
    }

    // Fetch one extra row (same trick as getPosts/getFeed) to know if
    // there's another page without a separate COUNT(*).
    const result = await db.query(
      `SELECT * FROM messages
       WHERE conversation_id = $1
         AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::int))
       ORDER BY created_at DESC, id DESC
       LIMIT $4`,
      [conversationId, cursor?.createdAt || null, cursor?.id || null, limit + 1]
    );

    const hasMore = result.rows.length > limit;
    const page = hasMore ? result.rows.slice(0, limit) : result.rows;
    const nextCursor = hasMore
      ? encodeCursor({ createdAt: page[page.length - 1].created_at, id: page[page.length - 1].id })
      : null;

    // Fetched newest-first for the keyset comparison above; reverse to
    // oldest-first so the client can render straight down the page.
    res.json({ messages: page.reverse(), nextCursor });
  } catch (err) {
    sendServerError(res, err, 'Fetch messages failed. Please try again later.');
  }
}

async function sendMessage(req, res) {
  try {
    const message = await messageService.sendMessage({
      conversationId: req.params.id,
      senderId: req.userId,
      content: req.body.content,
      clientTempId: req.body.clientTempId
    });

    // Still push it to anyone connected via the socket room -- this endpoint
    // exists for when the SENDER's socket is down, but other participants
    // may well still be connected and expect realtime delivery.
    try {
      getIO().to(`conv_${message.conversation_id}`).emit('new_message', message);
    } catch (err) {
      console.error('Failed to emit new_message over socket:', err.message);
    }

    res.status(201).json(message);
  } catch (err) {
    if (err instanceof messageService.MessageValidationError) {
      return res.status(400).send(err.message);
    }
    if (err instanceof messageService.NotParticipantError) {
      return res.status(403).send(err.message);
    }
    sendServerError(res, err, 'Send message failed. Please try again later.');
  }
}

async function markConversationRead(req, res) {
  try {
    const conversationId = parseInt(req.params.id);
    if (isNaN(conversationId)) {
      return res.status(400).send('Invalid conversation ID');
    }

    await messageService.markRead({ conversationId, userId: req.userId, upToMessageId: null });

    res.send('Conversation marked as read');
  } catch (err) {
    if (err instanceof messageService.NotParticipantError) {
      return res.status(403).send(err.message);
    }
    sendServerError(res, err, 'Mark conversation as read failed. Please try again later.');
  }
}

module.exports = {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  markConversationRead
};
