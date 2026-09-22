// Single source of truth for message validation + persistence. Both the
// socket 'send_message'/'mark_delivered'/'mark_read' handlers (sockets/index.js)
// and the REST endpoints (controllers/conversationController.js) call into
// this module instead of touching the DB directly, so the two transports can
// never drift -- fixing a bug or tightening a validation rule here fixes it
// for both at once.
const sanitizeHtml = require('sanitize-html');
const db = require('../db');
const { isRateLimited } = require('./rateLimiter');
const blockService = require('./blockService');

const MAX_MESSAGE_LENGTH = 5000;
const MAX_CLIENT_TEMP_ID_LENGTH = 255;

class MessageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MessageValidationError';
  }
}

class NotParticipantError extends Error {
  constructor(message = 'You are not a participant in this conversation') {
    super(message);
    this.name = 'NotParticipantError';
  }
}

class RateLimitError extends Error {
  constructor(message = 'You are sending messages too quickly. Please slow down.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

class MessageNotFoundError extends Error {
  constructor(message = 'Message not found') {
    super(message);
    this.name = 'MessageNotFoundError';
  }
}

class NotMessageOwnerError extends Error {
  constructor(message = 'You can only delete your own messages') {
    super(message);
    this.name = 'NotMessageOwnerError';
  }
}

class BlockedError extends Error {
  constructor(message = 'You cannot message this user') {
    super(message);
    this.name = 'BlockedError';
  }
}

// Chat messages are rendered as plain text everywhere in this app -- rather
// than trying to allow-list "safe" HTML, strip all markup entirely so
// <script>/onerror=/etc. can never reach a client that renders it unescaped.
function sanitizeContent(raw) {
  return sanitizeHtml(raw || '', { allowedTags: [], allowedAttributes: {} }).trim();
}

async function isParticipant(conversationId, userId) {
  const result = await db.query(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  return result.rows.length > 0;
}

// Only meaningful for direct (2-participant) conversations, the only kind
// this app creates today -- same assumption conversationController.
// getConversations already documents making.
async function getOtherParticipantId(conversationId, userId) {
  const result = await db.query(
    'SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2 LIMIT 1',
    [conversationId, userId]
  );
  return result.rows[0]?.user_id ?? null;
}

// Re-checked on every send (not just once at conversation-creation time) so
// a block placed AFTER an existing conversation was created still takes
// effect immediately -- old messages stay visible, but no new ones can be
// sent in either direction once either side has blocked the other.
async function assertNotBlocked(conversationId, senderId) {
  const otherUserId = await getOtherParticipantId(conversationId, senderId);
  if (otherUserId && (await blockService.isBlocked(senderId, otherUserId))) {
    throw new BlockedError();
  }
}

// Shared by every send path that accepts one -- an optimistic-UI id the
// CLIENT mints, so keeping the shape check identical everywhere (rather than
// only text validating it and voice trusting it blindly) matters: it's
// attacker/bug-reachable input the same way for both.
function validateClientTempId(clientTempId) {
  if (clientTempId === undefined || clientTempId === null) return;
  if (typeof clientTempId !== 'string' || clientTempId.length > MAX_CLIENT_TEMP_ID_LENGTH) {
    throw new MessageValidationError(`clientTempId must be a string under ${MAX_CLIENT_TEMP_ID_LENGTH} characters`);
  }
}

// Shared creation step for every message type (currently 'text' via
// sendMessage, 'voice' via sendVoiceMessage below) -- authorization and rate
// limiting must never be duplicated per-type, or the two paths could drift
// (e.g. one enforcing participation and the other forgetting to). Callers
// are expected to have already done their own type-specific validation
// (content shape, media fields, etc.) before reaching this.
async function createMessage({ conversationId, senderId, type, content, mediaUrl, durationSeconds, clientTempId }) {
  // Room membership alone is never trusted as authorization -- a socket
  // could theoretically still be joined to a stale room, so every write
  // re-checks conversation_participants directly.
  if (!(await isParticipant(conversationId, senderId))) {
    throw new NotParticipantError();
  }

  await assertNotBlocked(conversationId, senderId);

  // Per (sender, conversation) rather than per-sender globally, so a burst
  // in one conversation can't be used to argue the limit is unfairly
  // blocking an unrelated one. Same budget for text and voice sends --
  // one shared counter per (sender, conversation), not one each.
  if (isRateLimited(senderId, conversationId)) {
    throw new RateLimitError();
  }

  const result = await db.query(
    `INSERT INTO messages (conversation_id, sender_id, content, client_temp_id, type, media_url, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [conversationId, senderId, content ?? null, clientTempId || null, type, mediaUrl || null, durationSeconds ?? null]
  );
  return result.rows[0];
}

async function sendMessage({ conversationId, senderId, content, clientTempId }) {
  const convId = parseInt(conversationId, 10);
  if (isNaN(convId)) {
    throw new MessageValidationError('Invalid conversation ID');
  }

  const cleaned = sanitizeContent(content);
  if (!cleaned) {
    throw new MessageValidationError('Message content cannot be empty');
  }
  if (cleaned.length > MAX_MESSAGE_LENGTH) {
    throw new MessageValidationError(`Message content must be under ${MAX_MESSAGE_LENGTH} characters`);
  }

  validateClientTempId(clientTempId);

  return createMessage({ conversationId: convId, senderId, type: 'text', content: cleaned, clientTempId });
}

// mediaUrl/durationSeconds come from the Cloudinary upload result the
// caller already has in hand by this point (see controllers/
// conversationController.js's sendVoiceMessage) -- this function only
// validates and persists, it never talks to Cloudinary itself, so a
// validation failure here can never leave an upload half-done.
//
// clientTempId is optional and round-trips through untouched, same as
// sendMessage's -- the row this returns (and the new_message broadcast
// built from it) carries it back out so the sender's OWN optimistic bubble
// can be matched and deduplicated against that broadcast, the same
// reconciliation mechanism text sends already rely on.
async function sendVoiceMessage({ conversationId, senderId, mediaUrl, durationSeconds, clientTempId }) {
  const convId = parseInt(conversationId, 10);
  if (isNaN(convId)) {
    throw new MessageValidationError('Invalid conversation ID');
  }

  if (!mediaUrl || typeof mediaUrl !== 'string') {
    throw new MessageValidationError('A valid mediaUrl is required for a voice message');
  }

  const duration = Math.round(Number(durationSeconds));
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new MessageValidationError('duration_seconds must be a positive number');
  }

  validateClientTempId(clientTempId);

  return createMessage({
    conversationId: convId,
    senderId,
    type: 'voice',
    content: null,
    mediaUrl,
    durationSeconds: duration,
    clientTempId
  });
}

// Recipient's client got the new_message event and is actively connected --
// flips 'sent' -> 'delivered'. Never downgrades an already-'read' message,
// and a sender can't mark their own message delivered (that only makes
// sense from the receiving side).
async function markDelivered({ conversationId, userId, messageId }) {
  const convId = parseInt(conversationId, 10);
  const msgId = parseInt(messageId, 10);
  if (isNaN(convId) || isNaN(msgId)) {
    throw new MessageValidationError('Invalid conversationId or messageId');
  }

  if (!(await isParticipant(convId, userId))) {
    throw new NotParticipantError();
  }

  const result = await db.query(
    `UPDATE messages
     SET status = 'delivered'
     WHERE id = $1 AND conversation_id = $2 AND sender_id != $3 AND status = 'sent'
     RETURNING *`,
    [msgId, convId, userId]
  );
  // No row back means it was already delivered/read, didn't exist, or the
  // caller was the sender -- all benign no-ops for a best-effort receipt.
  return result.rows[0] || null;
}

// Marks everything up to (and including) upToMessageId as read for userId --
// or, if upToMessageId is omitted, up to whatever the newest message in the
// conversation currently is (this is what "open/view a conversation" means).
async function markRead({ conversationId, userId, upToMessageId }) {
  const convId = parseInt(conversationId, 10);
  if (isNaN(convId)) {
    throw new MessageValidationError('Invalid conversation ID');
  }

  if (!(await isParticipant(convId, userId))) {
    throw new NotParticipantError();
  }

  let threshold = null;
  if (upToMessageId !== undefined && upToMessageId !== null) {
    threshold = parseInt(upToMessageId, 10);
    if (isNaN(threshold)) {
      throw new MessageValidationError('Invalid messageId');
    }
  } else {
    const latest = await db.query('SELECT MAX(id) AS latest_id FROM messages WHERE conversation_id = $1', [convId]);
    threshold = latest.rows[0].latest_id;
  }

  if (threshold === null) {
    return { lastReadMessageId: null, updatedMessageIds: [] };
  }

  // Guards against an older/out-of-order read event moving the pointer
  // backward if events arrive out of sequence.
  await db.query(
    `UPDATE conversation_participants
     SET last_read_message_id = $1
     WHERE conversation_id = $2 AND user_id = $3
       AND (last_read_message_id IS NULL OR last_read_message_id < $1)`,
    [threshold, convId, userId]
  );

  const updated = await db.query(
    `UPDATE messages SET status = 'read'
     WHERE conversation_id = $1 AND sender_id != $2 AND status != 'read' AND id <= $3
     RETURNING id`,
    [convId, userId, threshold]
  );

  return { lastReadMessageId: threshold, updatedMessageIds: updated.rows.map((r) => r.id) };
}

// Sender-only, idempotent soft delete: verifies ownership by loading the row
// first (rather than a blind UPDATE ... WHERE sender_id = $x, which would
// silently no-op for a non-owner and hide the 403 from the caller), then
// sets deleted_at. A message already deleted is treated as success, not an
// error -- a duplicate click, or the REST fallback firing after the socket
// delete already landed, must not surface a spurious failure to the sender.
async function deleteMessage({ conversationId, messageId, userId }) {
  const convId = parseInt(conversationId, 10);
  const msgId = parseInt(messageId, 10);
  if (isNaN(convId) || isNaN(msgId)) {
    throw new MessageValidationError('Invalid conversationId or messageId');
  }

  const existing = await db.query(
    'SELECT * FROM messages WHERE id = $1 AND conversation_id = $2',
    [msgId, convId]
  );
  if (existing.rows.length === 0) {
    throw new MessageNotFoundError();
  }

  const message = existing.rows[0];
  if (message.sender_id !== userId) {
    throw new NotMessageOwnerError();
  }

  if (message.deleted_at) {
    return message;
  }

  // status (sent/delivered/read) is left untouched -- read status and
  // deleted state are independent of each other.
  const result = await db.query(
    `UPDATE messages SET deleted_at = now() WHERE id = $1 RETURNING *`,
    [msgId]
  );
  return result.rows[0];
}

// Soft-deleted messages (deleted_at set) keep their row -- other fields
// (id, sender_id, created_at, status) still matter for rendering a
// "message deleted" placeholder in the right place in the thread -- but
// their content must never reach a client over the wire.
function scrubDeletedContent(message) {
  if (!message.deleted_at) return message;
  return { ...message, content: null };
}

module.exports = {
  sendMessage,
  sendVoiceMessage,
  markDelivered,
  markRead,
  deleteMessage,
  isParticipant,
  sanitizeContent,
  scrubDeletedContent,
  MessageValidationError,
  NotParticipantError,
  RateLimitError,
  MessageNotFoundError,
  NotMessageOwnerError,
  BlockedError,
  MAX_MESSAGE_LENGTH,
  MAX_CLIENT_TEMP_ID_LENGTH
};
