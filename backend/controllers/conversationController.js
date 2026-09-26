const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { encodeCursor, decodeCursor, getLimit } = require('../utils/cursorPagination');
const messageService = require('../services/messageService');
const blockService = require('../services/blockService');
const { getIO } = require('../sockets');
const presence = require('../sockets/presence');

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
        other.last_seen,
        lm.id AS last_message_id,
        -- Media messages have no (or only caption) content, so label them;
        -- keep in sync with the frontend's messagePreviewText().
        CASE
          WHEN lm.deleted_at IS NOT NULL THEN 'This message was deleted'
          WHEN lm.type = 'voice' THEN 'Voice message'
          WHEN lm.type = 'image' THEN COALESCE('Photo: ' || NULLIF(lm.content, ''), 'Photo')
          ELSE lm.content
        END AS last_message,
        lm.created_at AS last_message_at,
        COALESCE(unread.count, 0)::int AS unread_count
      FROM conversation_participants cp
      JOIN conversations c ON c.id = cp.conversation_id AND c.type = 'direct'
      JOIN conversation_participants other_cp
        ON other_cp.conversation_id = c.id AND other_cp.user_id != cp.user_id
      JOIN users other ON other.id = other_cp.user_id
      LEFT JOIN LATERAL (
        -- Deliberately NOT filtering out deleted_at here (unlike the
        -- unread-count lateral below) -- the true last message is wanted
        -- even if it was deleted, so its preview can say so below instead
        -- of silently falling back to an older, no-longer-current message.
        SELECT id, content, type, created_at, deleted_at
        FROM messages m
        WHERE m.conversation_id = c.id
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

    // Presence is in-memory/per-process (see sockets/presence.js), not a
    // DB column, so it's annotated onto each row here rather than joined
    // in SQL.
    const rows = result.rows.map((row) => ({
      ...row,
      is_online: presence.isOnline(row.other_user_id)
    }));

    res.json(rows);
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

    if (await blockService.isBlocked(req.userId, targetUserId)) {
      return res.status(403).send('You cannot message this user');
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
    // oldest-first so the client can render straight down the page. Any
    // soft-deleted row keeps its place (id/sender/timestamp) but never
    // sends its content to the client.
    const withPreviews = await messageService.attachReplyPreviews(conversationId, page.reverse());
    res.json({ messages: withPreviews.map(messageService.scrubDeletedContent), nextCursor });
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
      clientTempId: req.body.clientTempId,
      replyToMessageId: req.body.replyToMessageId
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
    if (err instanceof messageService.BlockedError) {
      return res.status(403).send(err.message);
    }
    if (err instanceof messageService.RateLimitError) {
      return res.status(429).send(err.message);
    }
    sendServerError(res, err, 'Send message failed. Please try again later.');
  }
}

// By the time this runs, requireConversationParticipant has already
// rejected a non-participant and uploadToCloudinary has already uploaded
// the audio and attached req.cloudinaryResult -- if the Cloudinary upload
// itself failed, its error went to server.js's shared upload-error handler
// instead, and this handler never runs at all, so there's no path here that
// creates a DB row for a file that didn't actually make it to Cloudinary.
async function sendVoiceMessage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).send('An audio file is required (field name "audio")');
    }

    const message = await messageService.sendVoiceMessage({
      conversationId: req.params.id,
      senderId: req.userId,
      mediaUrl: req.cloudinaryResult.secure_url,
      // Cloudinary returns `duration` (seconds, float) for video/audio
      // resource_type uploads -- messageService.sendVoiceMessage rounds and
      // validates it.
      durationSeconds: req.cloudinaryResult.duration,
      // multer puts every non-file multipart field on req.body, same as the
      // existing post-image upload (createPost reads req.body.content the
      // same way alongside its own upload.single('image')).
      clientTempId: req.body.clientTempId
    });

    // Same reasoning as the text sendMessage REST path above: this endpoint
    // exists for a client that can't/doesn't use the socket for the upload
    // itself, but other participants may still be connected and expect
    // realtime delivery. type/media_url/duration_seconds are already on the
    // row (SELECT * in messageService), so the frontend can render it as a
    // voice bubble without a second fetch.
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
    if (err instanceof messageService.BlockedError) {
      return res.status(403).send(err.message);
    }
    if (err instanceof messageService.RateLimitError) {
      return res.status(429).send(err.message);
    }
    sendServerError(res, err, 'Send voice message failed. Please try again later.');
  }
}

async function deleteMessage(req, res) {
  try {
    const message = await messageService.deleteMessage({
      conversationId: req.params.id,
      messageId: req.params.messageId,
      userId: req.userId
    });

    // Same reasoning as sendMessage's REST path: this endpoint exists for
    // when the DELETING user's own socket is down, but other participants
    // may still be connected and expect the delete in real time.
    try {
      getIO().to(`conv_${message.conversation_id}`).emit('message_deleted', {
        conversationId: message.conversation_id,
        messageId: message.id,
        deletedAt: message.deleted_at
      });
    } catch (err) {
      console.error('Failed to emit message_deleted over socket:', err.message);
    }

    res.status(200).json(messageService.scrubDeletedContent(message));
  } catch (err) {
    if (err instanceof messageService.MessageValidationError) {
      return res.status(400).send(err.message);
    }
    if (err instanceof messageService.MessageNotFoundError) {
      return res.status(404).send(err.message);
    }
    if (err instanceof messageService.NotMessageOwnerError) {
      return res.status(403).send(err.message);
    }
    sendServerError(res, err, 'Delete message failed. Please try again later.');
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

// B9: POST /conversations/:id/messages/image (multipart 'image', optional
// 'caption', 'clientTempId', 'replyToMessageId'). Participation is checked
// by requireConversationParticipant BEFORE the upload, so a non-participant
// never gets to put a file on Cloudinary.
async function sendImageMessage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).send('An image file is required (field name "image")');
    }
    const message = await messageService.sendImageMessage({
      conversationId: req.params.id,
      senderId: req.userId,
      mediaUrl: req.cloudinaryResult.secure_url,
      caption: req.body.caption,
      clientTempId: req.body.clientTempId,
      replyToMessageId: req.body.replyToMessageId
    });
    try {
      getIO().to(`conv_${message.conversation_id}`).emit('new_message', message);
    } catch (err) {
      console.error('Failed to emit new_message over socket:', err.message);
    }
    res.status(201).json(message);
  } catch (err) {
    if (err instanceof messageService.MessageValidationError) return res.status(400).send(err.message);
    if (err instanceof messageService.NotParticipantError) return res.status(403).send(err.message);
    if (err instanceof messageService.BlockedError) return res.status(403).send(err.message);
    if (err instanceof messageService.RateLimitError) return res.status(429).send(err.message);
    sendServerError(res, err, 'Send image failed. Please try again later.');
  }
}

// B9: PUT /conversations/:id/messages/:messageId { content } -- REST twin of
// the socket 'edit_message' event (same service, same broadcast).
async function editMessage(req, res) {
  try {
    const message = await messageService.editMessage({
      conversationId: req.params.id,
      messageId: req.params.messageId,
      userId: req.userId,
      content: req.body.content
    });
    try {
      getIO().to(`conv_${message.conversation_id}`).emit('message_edited', { conversationId: message.conversation_id, message });
    } catch (err) {
      console.error('Failed to emit message_edited over socket:', err.message);
    }
    res.json(message);
  } catch (err) {
    if (err instanceof messageService.MessageValidationError) return res.status(400).send(err.message);
    if (err instanceof messageService.MessageNotFoundError) return res.status(404).send(err.message);
    if (err instanceof messageService.NotMessageOwnerError) return res.status(403).send(err.message);
    if (err instanceof messageService.NotEditableError) return res.status(403).send(err.message);
    sendServerError(res, err, 'Edit message failed. Please try again later.');
  }
}

module.exports = {
  getConversations,
  sendImageMessage,
  editMessage,
  createConversation,
  getMessages,
  sendMessage,
  sendVoiceMessage,
  deleteMessage,
  markConversationRead
};
