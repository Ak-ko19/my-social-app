// Single source of truth for message validation + persistence. Both the
// socket 'send_message'/'mark_delivered'/'mark_read' handlers (sockets/index.js)
// and the REST endpoints (controllers/conversationController.js) call into
// this module instead of touching the DB directly, so the two transports can
// never drift -- fixing a bug or tightening a validation rule here fixes it
// for both at once.
const sanitizeHtml = require('sanitize-html');
const db = require('../db');

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

  if (clientTempId !== undefined && clientTempId !== null) {
    if (typeof clientTempId !== 'string' || clientTempId.length > MAX_CLIENT_TEMP_ID_LENGTH) {
      throw new MessageValidationError(`clientTempId must be a string under ${MAX_CLIENT_TEMP_ID_LENGTH} characters`);
    }
  }

  // Room membership alone is never trusted as authorization -- a socket
  // could theoretically still be joined to a stale room, so every write
  // re-checks conversation_participants directly.
  if (!(await isParticipant(convId, senderId))) {
    throw new NotParticipantError();
  }

  const result = await db.query(
    `INSERT INTO messages (conversation_id, sender_id, content, client_temp_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [convId, senderId, cleaned, clientTempId || null]
  );
  return result.rows[0];
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

module.exports = {
  sendMessage,
  markDelivered,
  markRead,
  isParticipant,
  sanitizeContent,
  MessageValidationError,
  NotParticipantError,
  MAX_MESSAGE_LENGTH,
  MAX_CLIENT_TEMP_ID_LENGTH
};
