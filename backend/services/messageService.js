// Single source of truth for message validation + persistence. Both the
// socket 'send_message'/'mark_delivered'/'mark_read' handlers (sockets/index.js)
// and the REST endpoints (controllers/conversationController.js) call into
// this module instead of touching the DB directly, so the two transports can
// never drift -- fixing a bug or tightening a validation rule here fixes it
// for both at once.
const sanitizeHtml = require('sanitize-html');
const db = require('../db');
const { pushNewMessage } = require('./pushService');
const { isRateLimited } = require('./rateLimiter');
const blockService = require('./blockService');
const { deleteMedia } = require('./mediaCleanupService');
const { isValidReaction } = require('./reactionService');

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

// B9: how long after sending a text message can still be edited (same idea
// as Messenger/WhatsApp) -- long enough to fix a typo, short enough that a
// conversation's history can't be quietly rewritten later.
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

class NotEditableError extends Error {
  constructor(message = 'This message can no longer be edited') {
    super(message);
    this.name = 'NotEditableError';
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

// B10: 'direct' | 'group' | null (no such conversation).
async function getConversationType(conversationId) {
  const result = await db.query('SELECT type FROM conversations WHERE id = $1', [conversationId]);
  return result.rows[0]?.type ?? null;
}

// Only meaningful for direct (2-participant) conversations.
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
//
// B10: groups are exempt (WhatsApp-style) -- a block between two members
// doesn't silence the whole group; instead groupController refuses to put
// blocked pairs into the same group in the first place.
async function assertNotBlocked(conversationId, senderId) {
  if ((await getConversationType(conversationId)) === 'group') return;
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
async function createMessage({ conversationId, senderId, type, content, mediaUrl, durationSeconds, clientTempId, replyToMessageId = null }) {
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
    `INSERT INTO messages (conversation_id, sender_id, content, client_temp_id, type, media_url, duration_seconds, reply_to_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [conversationId, senderId, content ?? null, clientTempId || null, type, mediaUrl || null, durationSeconds ?? null, replyToMessageId]
  );
  // Day 22: a push to participants who aren't in the app right now.
  pushNewMessage({ conversationId, senderId });
  // Every new message goes out with its reply preview already attached, so
  // a new_message broadcast renders the quote without another fetch.
  const [withPreview] = await attachReplyPreviews(conversationId, result.rows);
  return withPreview;
}

async function sendMessage({ conversationId, senderId, content, clientTempId, replyToMessageId }) {
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

  const replyTo = await validateReplyTo(convId, replyToMessageId);
  return createMessage({ conversationId: convId, senderId, type: 'text', content: cleaned, clientTempId, replyToMessageId: replyTo });
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

  // B10: a message has ONE status field, which can't honestly describe
  // many recipients -- group messages stay 'sent' (no ticks), like most
  // apps without per-member receipts. Unread counts still work per member
  // via last_read_message_id.
  if ((await getConversationType(convId)) === 'group') return null;

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

  if ((await getConversationType(convId)) === 'group') {
    return { lastReadMessageId: threshold, updatedMessageIds: [] };
  }

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
  // Day 31: an unsent message keeps no reactions (as on Messenger).
  await db.query('DELETE FROM message_reactions WHERE message_id = $1', [msgId]);
  // The row stays (soft delete; the API no longer exposes its media_url),
  // but the photo / voice note itself is removed from Cloudinary.
  deleteMedia([message.media_url]);
  return result.rows[0];
}

// Day 12: a moderator removing a reported message -- the same soft delete
// as an unsend (the chat shows "message deleted"), without the sender
// check. Returns the updated row, or null if it's missing or already gone.
async function removeMessageAsModerator(messageId) {
  const result = await db.query(
    'UPDATE messages SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
    [messageId]
  );
  const message = result.rows[0];
  if (!message) return null;
  await db.query('DELETE FROM message_reactions WHERE message_id = $1', [messageId]);
  deleteMedia([message.media_url]);
  return message;
}

// B9 reply-to: the target must be a message in the SAME conversation (so a
// reply can never quote -- and so leak -- a message from a conversation the
// sender isn't in). Returns the id to store, or null for a normal message.
async function validateReplyTo(conversationId, replyToMessageId) {
  if (replyToMessageId === undefined || replyToMessageId === null || replyToMessageId === '') return null;
  const id = Number(replyToMessageId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new MessageValidationError('Invalid replyToMessageId');
  }
  const result = await db.query('SELECT id FROM messages WHERE id = $1 AND conversation_id = $2', [id, conversationId]);
  if (result.rows.length === 0) {
    throw new MessageValidationError('The message you are replying to is not in this conversation');
  }
  return id;
}

const REPLY_PREVIEW_LENGTH = 120;

// Adds reply_to: { id, sender_id, type, content, deleted } to every row
// that replies to something -- one query for the whole page, not one per
// message. A deleted original shows as deleted (no content), same scrub
// rule as the thread itself.
async function attachReplyPreviews(conversationId, rows) {
  const ids = [...new Set(rows.map((r) => r.reply_to_message_id).filter(Boolean))];
  if (ids.length === 0) return rows.map((r) => ({ ...r, reply_to: null }));
  const result = await db.query(
    'SELECT id, sender_id, type, content, deleted_at FROM messages WHERE id = ANY($1::int[]) AND conversation_id = $2',
    [ids, conversationId]
  );
  const byId = new Map(result.rows.map((m) => [m.id, m]));
  return rows.map((r) => {
    const original = r.reply_to_message_id ? byId.get(r.reply_to_message_id) : null;
    if (!original) return { ...r, reply_to: null };
    const deleted = Boolean(original.deleted_at);
    return {
      ...r,
      reply_to: {
        id: original.id,
        sender_id: original.sender_id,
        type: original.type,
        deleted,
        content: deleted || !original.content ? null : original.content.slice(0, REPLY_PREVIEW_LENGTH)
      }
    };
  });
}

// B9 image messages. mediaUrl comes from the caller's Cloudinary upload
// (same split as sendVoiceMessage: this only validates and persists).
// content is an optional caption.
async function sendImageMessage({ conversationId, senderId, mediaUrl, caption, clientTempId, replyToMessageId }) {
  const convId = parseInt(conversationId, 10);
  if (isNaN(convId)) {
    throw new MessageValidationError('Invalid conversation ID');
  }
  if (!mediaUrl || typeof mediaUrl !== 'string') {
    throw new MessageValidationError('An image is required');
  }
  const cleanedCaption = sanitizeContent(caption || '');
  if (cleanedCaption.length > MAX_MESSAGE_LENGTH) {
    throw new MessageValidationError(`Caption must be under ${MAX_MESSAGE_LENGTH} characters`);
  }
  validateClientTempId(clientTempId);
  const replyTo = await validateReplyTo(convId, replyToMessageId);
  return createMessage({
    conversationId: convId,
    senderId,
    type: 'image',
    content: cleanedCaption || null,
    mediaUrl,
    clientTempId,
    replyToMessageId: replyTo
  });
}

// B9 edit: the sender's own TEXT message, not deleted, within
// MESSAGE_EDIT_WINDOW_MS of sending. Sets edited_at (shown as "edited").
async function editMessage({ conversationId, messageId, userId, content }) {
  const convId = parseInt(conversationId, 10);
  const msgId = parseInt(messageId, 10);
  if (isNaN(convId) || isNaN(msgId)) {
    throw new MessageValidationError('Invalid conversationId or messageId');
  }
  const cleaned = sanitizeContent(content);
  if (!cleaned) {
    throw new MessageValidationError('Message content cannot be empty');
  }
  if (cleaned.length > MAX_MESSAGE_LENGTH) {
    throw new MessageValidationError(`Message content must be under ${MAX_MESSAGE_LENGTH} characters`);
  }

  const existing = await db.query('SELECT * FROM messages WHERE id = $1 AND conversation_id = $2', [msgId, convId]);
  if (existing.rows.length === 0) {
    throw new MessageNotFoundError();
  }
  const message = existing.rows[0];
  if (message.sender_id !== userId) {
    throw new NotMessageOwnerError('You can only edit your own messages');
  }
  if (message.deleted_at) {
    throw new NotEditableError('A deleted message cannot be edited');
  }
  if (message.type !== 'text') {
    throw new NotEditableError('Only text messages can be edited');
  }
  if (Date.now() - new Date(message.created_at).getTime() > MESSAGE_EDIT_WINDOW_MS) {
    throw new NotEditableError('Messages can only be edited within 15 minutes of sending');
  }

  const result = await db.query(
    'UPDATE messages SET content = $1, edited_at = now() WHERE id = $2 RETURNING *',
    [cleaned, msgId]
  );
  const [withPreview] = await attachReactions(await attachReplyPreviews(convId, result.rows));
  return withPreview;
}

// Soft-deleted messages (deleted_at set) keep their row -- other fields
// (id, sender_id, created_at, status) still matter for rendering a
// "message deleted" placeholder in the right place in the thread -- but
// their content must never reach a client over the wire.
//
// B9 audit fix: media is scrubbed too. Before this, a deleted VOICE
// message still sent its media_url (and duration) to both participants, so
// it stayed playable; the same would apply to image messages.
function scrubDeletedContent(message) {
  if (!message.deleted_at) return message;
  return { ...message, content: null, media_url: null, duration_seconds: null, reactions: [] };
}

// Day 31: reactions on these messages, as reactions: [{ user_id, reaction }]
// (oldest first) on each row -- one query for the whole page.
async function attachReactions(rows) {
  const ids = rows.map((r) => r.id).filter((id) => id != null);
  if (ids.length === 0) return rows.map((r) => ({ ...r, reactions: [] }));
  const result = await db.query(
    'SELECT message_id, user_id, reaction FROM message_reactions WHERE message_id = ANY($1::int[]) ORDER BY created_at, user_id',
    [ids]
  );
  const byMessage = new Map();
  for (const row of result.rows) {
    if (!byMessage.has(row.message_id)) byMessage.set(row.message_id, []);
    byMessage.get(row.message_id).push({ user_id: row.user_id, reaction: row.reaction });
  }
  return rows.map((r) => ({ ...r, reactions: byMessage.get(r.id) || [] }));
}

// Day 31: set (reaction = one of the six) or remove (reaction = null) the
// user's reaction on a message. Same rules as sending in this chat: only
// participants, not to a blocked person in a DM, and not on an unsent
// message. Returns { conversationId, messageId, reactions } for the
// broadcast.
async function setReaction({ conversationId, messageId, userId, reaction }) {
  const convId = parseInt(conversationId, 10);
  const msgId = parseInt(messageId, 10);
  if (isNaN(convId) || isNaN(msgId)) {
    throw new MessageValidationError('Invalid conversationId or messageId');
  }
  if (reaction !== null && !isValidReaction(reaction)) {
    throw new MessageValidationError('Unknown reaction');
  }
  if (!(await isParticipant(convId, userId))) {
    throw new NotParticipantError();
  }
  const existing = await db.query('SELECT id, deleted_at FROM messages WHERE id = $1 AND conversation_id = $2', [msgId, convId]);
  if (existing.rows.length === 0) {
    throw new MessageNotFoundError();
  }
  if (existing.rows[0].deleted_at) {
    throw new NotEditableError("You can't react to a deleted message");
  }
  await assertNotBlocked(convId, userId);

  if (reaction === null) {
    await db.query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [msgId, userId]);
  } else {
    await db.query(
      `INSERT INTO message_reactions (message_id, user_id, reaction) VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now()`,
      [msgId, userId, reaction]
    );
  }
  const [withReactions] = await attachReactions([{ id: msgId }]);
  return { conversationId: convId, messageId: msgId, reactions: withReactions.reactions };
}

module.exports = {
  sendMessage,
  sendVoiceMessage,
  sendImageMessage,
  editMessage,
  attachReplyPreviews,
  attachReactions,
  setReaction,
  markDelivered,
  markRead,
  deleteMessage,
  removeMessageAsModerator,
  isParticipant,
  getConversationType,
  sanitizeContent,
  scrubDeletedContent,
  MessageValidationError,
  NotParticipantError,
  RateLimitError,
  MessageNotFoundError,
  NotMessageOwnerError,
  BlockedError,
  NotEditableError,
  MESSAGE_EDIT_WINDOW_MS,
  MAX_MESSAGE_LENGTH,
  MAX_CLIENT_TEMP_ID_LENGTH
};
