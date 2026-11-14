// Day 116: what happens to a message after it is sent -- delivered and read
// receipts, unsend, a moderator's removal, edits and reactions. Split out of
// messageService.js.
const db = require('../../db');
const { deleteMedia } = require('../mediaCleanupService');
const { isValidReaction } = require('../reactionService');
const { toUnicode } = require('../../utils/myanmarText');
const {
  MAX_MESSAGE_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  MessageValidationError,
  NotParticipantError,
  MessageNotFoundError,
  NotMessageOwnerError,
  NotEditableError,
  messageText,
  isParticipant,
  getConversationType,
  assertNotBlocked
} = require('./core');
const { attachReplyPreviews, attachReactions } = require('./decorate');

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
// Day 63: q is the admin action's transaction; deleteMediaNow false leaves
// the photo / voice note to the caller, to delete once that has committed.
async function removeMessageAsModerator(messageId, { q = db, deleteMediaNow = true } = {}) {
  const result = await q.query(
    'UPDATE messages SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
    [messageId]
  );
  const message = result.rows[0];
  if (!message) return null;
  await q.query('DELETE FROM message_reactions WHERE message_id = $1', [messageId]);
  if (deleteMediaNow) deleteMedia([message.media_url]);
  return message;
}

// B9 edit: the sender's own TEXT message, not deleted, within
// MESSAGE_EDIT_WINDOW_MS of sending. Sets edited_at (shown as "edited").
async function editMessage({ conversationId, messageId, userId, content }) {
  const convId = parseInt(conversationId, 10);
  const msgId = parseInt(messageId, 10);
  if (isNaN(convId) || isNaN(msgId)) {
    throw new MessageValidationError('Invalid conversationId or messageId');
  }
  const cleaned = messageText(content);
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
  // Day 100: a story reaction is its emoji, not text to rewrite.
  if (message.story_reply === 'reaction') {
    throw new NotEditableError("A reaction to a story can't be edited");
  }
  if (Date.now() - new Date(message.created_at).getTime() > MESSAGE_EDIT_WINDOW_MS) {
    throw new NotEditableError('Messages can only be edited within 15 minutes of sending');
  }

  const result = await db.query(
    'UPDATE messages SET content = $1, edited_at = now() WHERE id = $2 RETURNING *',
    [toUnicode(cleaned), msgId]
  );
  const [withPreview] = await attachReactions(await attachReplyPreviews(convId, result.rows));
  return withPreview;
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

module.exports = { markDelivered, markRead, deleteMessage, removeMessageAsModerator, editMessage, setReaction };
