const db = require('../db');
const interactionService = require('../services/interactionService');
const { sendError } = require('../utils/httpError');
const logger = require('../utils/logger');
const { escapeLike } = require('../utils/escapeLike');
const { encodeCursor, decodeCursor, getLimit } = require('../utils/cursorPagination');
const messageService = require('../services/messageService');
const blockService = require('../services/blockService');
const { getIO, syncRooms } = require('../sockets');
const presence = require('../sockets/presence');

// Day 70: GET /conversations?cursor=&limit=&q= -- your chats, most recent
// activity first, a page at a time ({ conversations, nextCursor }); q keeps
// only chats whose name (a group's, or the other person's username)
// contains it. ?id= answers just that one chat, in the same shape (a chat's
// header uses it). The page is picked first -- each chat's last activity,
// keyset by conversation id, compared in SQL so no timestamp goes through a
// JS Date -- and the details below are read for those chats only.
const INBOX_PAGE_SQL = `
  WITH mine AS (
    SELECT c.id, COALESCE(lm.created_at, c.created_at) AS activity_at,
      CASE WHEN c.type = 'group' THEN c.name ELSE (
        SELECT u.username FROM conversation_participants o JOIN users u ON u.id = o.user_id
        WHERE o.conversation_id = c.id AND o.user_id <> $1 LIMIT 1
      ) END AS name
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    LEFT JOIN LATERAL (
      SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) lm ON true
    WHERE cp.user_id = $1
  )
  SELECT id FROM mine
  WHERE ($2::int IS NULL OR (activity_at, id) < (SELECT activity_at, id FROM mine WHERE id = $2))
    AND ($3 = '' OR name ILIKE '%' || $3 || '%')
  ORDER BY activity_at DESC, id DESC
  LIMIT $4`;

async function getConversations(req, res) {
  try {
    let ids;
    let nextCursor = null;
    if (req.query.id !== undefined) {
      const one = Number(req.query.id);
      if (!Number.isInteger(one) || one < 1) return res.status(400).send('Invalid conversation ID');
      ids = [one];
    } else {
      const limit = getLimit(req, { defaultLimit: 20, maxLimit: 50 });
      let cursor;
      try {
        cursor = decodeCursor(req.query.cursor);
      } catch (err) {
        return res.status(400).send('Invalid cursor');
      }
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const page = await db.query(INBOX_PAGE_SQL, [req.userId, cursor?.id ?? null, escapeLike(q), limit + 1]);
      ids = page.rows.slice(0, limit).map((r) => r.id);
      if (page.rows.length > limit) nextCursor = encodeCursor({ id: ids[ids.length - 1] });
    }

    // Direct chats: exactly 2 participants (type = 'direct').
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
        COALESCE(lm.created_at, c.created_at) AS activity_at,
        COALESCE(unread.count, 0)::int AS unread_count,
        -- Day 23: muted for you (no message notifications)
        COALESCE(cp.muted_until > now(), false) AS muted
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
          -- Day 27: COALESCE, not "IS NULL OR": the same rows (ids start at
          -- 1), but Postgres can then read just this id range from
          -- idx_messages_conversation_id instead of the whole conversation.
          AND m.id > COALESCE(cp.last_read_message_id, 0)
      ) unread ON true
      WHERE cp.user_id = $1 AND c.id = ANY($2::int[])
    `, [req.userId, ids]);

    // Presence is in-memory/per-process (see sockets/presence.js), not a
    // DB column, so it's annotated onto each row here rather than joined
    // in SQL.
    const rows = result.rows.map((row) => ({
      ...row,
      type: 'direct',
      is_online: presence.isOnline(row.other_user_id)
    }));

    // B10 group conversations. Same row shape as direct ones (so the inbox
    // renders them unchanged: `username` carries the group name), plus
    // type/name/member_count. The preview names the sender -- in a group
    // "who said it" matters.
    const groups = await db.query(`
      SELECT
        c.id AS conversation_id,
        'group' AS type,
        c.name,
        c.name AS username,
        NULL::int AS other_user_id,
        c.avatar_url,
        (SELECT COUNT(*)::int FROM conversation_participants m WHERE m.conversation_id = c.id) AS member_count,
        lm.id AS last_message_id,
        CASE
          WHEN lm.id IS NULL THEN NULL
          ELSE (CASE WHEN lm.sender_id = $1 THEN 'You' ELSE sender.username END) || ': ' ||
            CASE
              WHEN lm.deleted_at IS NOT NULL THEN 'This message was deleted'
              WHEN lm.type = 'voice' THEN 'Voice message'
              WHEN lm.type = 'image' THEN COALESCE('Photo: ' || NULLIF(lm.content, ''), 'Photo')
              ELSE lm.content
            END
        END AS last_message,
        lm.created_at AS last_message_at,
        COALESCE(lm.created_at, c.created_at) AS activity_at,
        COALESCE(unread.count, 0)::int AS unread_count,
        COALESCE(cp.muted_until > now(), false) AS muted
      FROM conversation_participants cp
      JOIN conversations c ON c.id = cp.conversation_id AND c.type = 'group'
      LEFT JOIN LATERAL (
        SELECT id, sender_id, content, type, created_at, deleted_at
        FROM messages m WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1
      ) lm ON true
      LEFT JOIN users sender ON sender.id = lm.sender_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count FROM messages m
        WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.deleted_at IS NULL
          -- Day 27: COALESCE, not "IS NULL OR": the same rows (ids start at
          -- 1), but Postgres can then read just this id range from
          -- idx_messages_conversation_id instead of the whole conversation.
          AND m.id > COALESCE(cp.last_read_message_id, 0)
      ) unread ON true
      WHERE cp.user_id = $1 AND c.id = ANY($2::int[])
    `, [req.userId, ids]);

    // In the page's order (most recent activity first; a chat with no
    // messages yet by when it was created).
    const byId = new Map([...rows, ...groups.rows.map((g) => ({ ...g, is_online: false }))].map((c) => [c.conversation_id, c]));
    const conversations = ids.map((id) => byId.get(id)).filter(Boolean);
    if (req.query.id !== undefined && conversations.length === 0) return res.status(404).send('Conversation not found');
    res.json({ conversations, nextCursor });
  } catch (err) {
    sendError(res, err, 'Fetch conversations failed. Please try again later.');
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

    // Day 47: a new chat only with someone who accepts messages from you
    // (an existing one opens either way; sending is checked every time).
    if (!(await interactionService.canMessage(req.userId, targetUserId))) {
      return res.status(403).send("This person isn't accepting messages from you");
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
    // Day 64: both people's open sockets join the new chat's room now, or
    // its first messages only appear after a reload (found by journeys-core).
    syncRooms(conversation.id, [req.userId, targetUserId], 'join');

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
    sendError(res, err, 'Create conversation failed. Please try again later.');
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
    // there's another page without a separate COUNT(*). Day 70: the page
    // ends before the cursor's message, compared with that row's own stored
    // (created_at, id) -- microseconds included, which a timestamp sent
    // through a JS Date would lose. A cursor from another chat matches nothing.
    const result = await db.query(
      `SELECT * FROM messages
       WHERE conversation_id = $1
         AND ($2::int IS NULL OR (created_at, id) < (
           SELECT c.created_at, c.id FROM messages c WHERE c.id = $2 AND c.conversation_id = $1
         ))
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [conversationId, cursor?.id ?? null, limit + 1]
    );

    const hasMore = result.rows.length > limit;
    const page = hasMore ? result.rows.slice(0, limit) : result.rows;
    const nextCursor = hasMore
      ? encodeCursor({ id: page[page.length - 1].id })
      : null;

    // Fetched newest-first for the keyset comparison above; reverse to
    // oldest-first so the client can render straight down the page. Any
    // soft-deleted row keeps its place (id/sender/timestamp) but never
    // sends its content to the client.
    const withPreviews = await messageService.attachReactions(await messageService.attachReplyPreviews(conversationId, page.reverse()));
    res.json({ messages: withPreviews.map(messageService.scrubDeletedContent), nextCursor });
  } catch (err) {
    sendError(res, err, 'Fetch messages failed. Please try again later.');
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
      logger.error('socket emit failed', { event: 'new_message', err });
    }

    res.status(201).json(message);
  } catch (err) {
    sendError(res, err, 'Send message failed. Please try again later.');
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
      logger.error('socket emit failed', { event: 'new_message', err });
    }

    res.status(201).json(message);
  } catch (err) {
    sendError(res, err, 'Send voice message failed. Please try again later.');
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
      logger.error('socket emit failed', { event: 'message_deleted', err });
    }

    res.status(200).json(messageService.scrubDeletedContent(message));
  } catch (err) {
    sendError(res, err, 'Delete message failed. Please try again later.');
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
    sendError(res, err, 'Mark conversation as read failed. Please try again later.');
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
      logger.error('socket emit failed', { event: 'new_message', err });
    }
    res.status(201).json(message);
  } catch (err) {
    sendError(res, err, 'Send image failed. Please try again later.');
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
      logger.error('socket emit failed', { event: 'message_edited', err });
    }
    res.json(message);
  } catch (err) {
    sendError(res, err, 'Edit message failed. Please try again later.');
  }
}

// Day 31: PUT /conversations/:id/messages/:messageId/reaction { reaction }
// sets the caller's reaction (one of the six); DELETE removes it. Everyone
// in the chat sees it at once (socket message_reaction).
async function setMessageReaction(req, res) {
  try {
    const reaction = req.method === 'DELETE' ? null : req.body?.reaction;
    if (req.method !== 'DELETE' && typeof reaction !== 'string') return res.status(400).send('reaction is required');
    const update = await messageService.setReaction({
      conversationId: req.params.id,
      messageId: req.params.messageId,
      userId: req.userId,
      reaction
    });
    try {
      getIO().to(`conv_${update.conversationId}`).emit('message_reaction', update);
    } catch (err) {
      logger.error('socket emit failed', { event: 'message_reaction', err });
    }
    res.json(update);
  } catch (err) {
    // An unsent message can't take reactions or be forwarded: a conflict
    // here, not the 403 it is when editing.
    if (err instanceof messageService.NotEditableError) return res.status(409).send(err.message);
    sendError(res, err, 'Reacting failed. Please try again later.');
  }
}

// Day 32: POST /conversations/:id/messages/:messageId/forward
// { conversationIds: [..] } -- forward a message to up to 5 of your chats.
// Each chat succeeds or fails on its own: { forwarded: [messages], failed:
// [{ conversationId, status, error }] }. 201 when at least one went out;
// otherwise the first failure's status.
async function forwardMessage(req, res) {
  try {
    const result = await messageService.forwardMessage({
      conversationId: req.params.id,
      messageId: req.params.messageId,
      userId: req.userId,
      targetIds: req.body?.conversationIds
    });
    for (const message of result.forwarded) {
      try {
        getIO().to(`conv_${message.conversation_id}`).emit('new_message', message);
      } catch (err) {
        logger.error('socket emit failed', { event: 'new_message', err });
      }
    }
    res.status(result.forwarded.length > 0 ? 201 : result.failed[0].status).json(result);
  } catch (err) {
    // An unsent message can't take reactions or be forwarded: a conflict
    // here, not the 403 it is when editing.
    if (err instanceof messageService.NotEditableError) return res.status(409).send(err.message);
    sendError(res, err, 'Forwarding failed. Please try again later.');
  }
}

// Day 23: PUT /conversations/:id/mute { duration: '8h' | '1w' | 'always' | null }
// -- no message notifications from this chat for that long (null = unmute).
// Only for people in the conversation; anyone else gets the same 404 as a
// conversation that doesn't exist.
const MUTE_DURATIONS = { '8h': "now() + interval '8 hours'", '1w': "now() + interval '7 days'", always: "'infinity'::timestamptz" };

async function muteConversation(req, res) {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId)) return res.status(400).send('Invalid conversation ID');
    const duration = req.body?.duration ?? null;
    if (duration !== null && !Object.hasOwn(MUTE_DURATIONS, duration)) {
      return res.status(400).send(`duration must be one of: ${Object.keys(MUTE_DURATIONS).join(', ')}, or null`);
    }
    // The interval comes only from the fixed map above, never from input.
    const result = await db.query(
      `UPDATE conversation_participants SET muted_until = ${duration === null ? 'NULL' : MUTE_DURATIONS[duration]}
       WHERE conversation_id = $1 AND user_id = $2
       RETURNING COALESCE(muted_until > now(), false) AS muted,
         CASE WHEN muted_until > now() AND muted_until <> 'infinity' THEN muted_until END AS muted_until`,
      [conversationId, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).send('Conversation not found');
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Muting the conversation failed. Please try again later.');
  }
}

module.exports = {
  muteConversation,
  getConversations,
  sendImageMessage,
  editMessage,
  createConversation,
  getMessages,
  sendMessage,
  sendVoiceMessage,
  deleteMessage,
  markConversationRead,
  setMessageReaction,
  forwardMessage
};
