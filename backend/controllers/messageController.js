// Day 116: the HTTP side of a chat's messages -- the history page, sending
// (text, voice note, photo), edit, unsend, read, reactions and forwarding.
// Each handler checks its input and calls services/messageService, then
// tells the chat's room over Socket.IO. Split out of
// conversationController.js, which keeps the chat list (inbox, opening a
// chat, mute, pin, archive).
const db = require('../db');
const { sendError } = require('../utils/httpError');
const logger = require('../utils/logger');
const { encodeCursor, decodeCursor, getLimit } = require('../utils/cursorPagination');
const messageService = require('../services/messageService');
const { getIO } = require('../sockets');

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

module.exports = {
  getMessages,
  sendMessage,
  sendVoiceMessage,
  sendImageMessage,
  editMessage,
  deleteMessage,
  markConversationRead,
  setMessageReaction,
  forwardMessage
};
