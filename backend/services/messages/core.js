// Day 116: the core of every message -- the limits, the error types, and the
// checks and the single INSERT that every send path shares (createMessage):
// being in the chat, blocks and "who can message me" (assertNotBlocked),
// the spam check and the send rate limit. Split out of messageService.js,
// which is still the one entry point the rest of the app requires.
const { HttpError } = require('../../utils/httpError');
const db = require('../../db');
const interactionService = require('../interactionService');
const { pushNewMessage } = require('../pushService');
const { isRateLimited } = require('../rateLimiter');
const blockService = require('../blockService');
const spamService = require('../spamService');
const { attachReplyPreviews } = require('./decorate');

const MAX_MESSAGE_LENGTH = 5000;
const MAX_CLIENT_TEMP_ID_LENGTH = 255;

class MessageValidationError extends HttpError {
  constructor(message) {
    super(400, message);
  }
}

class NotParticipantError extends HttpError {
  constructor(message = 'You are not a participant in this conversation') {
    super(403, message);
  }
}

class RateLimitError extends HttpError {
  constructor(message = 'You are sending messages too quickly. Please slow down.') {
    super(429, message);
  }
}

class MessageNotFoundError extends HttpError {
  constructor(message = 'Message not found') {
    super(404, message);
  }
}

class NotMessageOwnerError extends HttpError {
  constructor(message = 'You can only delete your own messages') {
    super(403, message);
  }
}

// B9: how long after sending a text message can still be edited (same idea
// as Messenger/WhatsApp) -- long enough to fix a typo, short enough that a
// conversation's history can't be quietly rewritten later.
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

class NotEditableError extends HttpError {
  constructor(message = 'This message can no longer be edited') {
    super(403, message);
  }
}

class BlockedError extends HttpError {
  constructor(message = 'You cannot message this user') {
    super(403, message);
  }
}

// A message is kept as typed, like a post or a comment: it is text, and
// every client shows it as text (React escapes it; push notifications are
// plain text), so "<b>hi</b>" reads "<b>hi</b>". Day 75: it used to go
// through an HTML sanitizer with no tags allowed, which ate ordinary text
// ("if x<y and y>z" became "if xz") and stored & < > as &amp; &lt; &gt;
// (shown as such); migration 071 turned those back. Anything but a string
// (the socket takes JSON) counts as empty. Day 43: callers then check the
// length on the text as typed (like the composer's maxLength) and store it
// with Zawgyi Myanmar converted to Unicode (utils/myanmarText) -- send,
// caption and edit, HTTP and socket.
function messageText(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
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
  // Day 47: and the other person's "who can message me" setting.
  if (otherUserId && !(await interactionService.canMessage(senderId, otherUserId))) {
    throw new BlockedError("This person isn't accepting messages from you");
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

// Shared creation step for every message type (text, voice, image, story
// replies and forwards -- all in send.js) -- authorization and rate
// limiting must never be duplicated per-type, or the paths could drift
// (e.g. one enforcing participation and the other forgetting to). Callers
// are expected to have already done their own type-specific validation
// (content shape, media fields, etc.) before reaching this.
async function createMessage({ conversationId, senderId, type, content, mediaUrl, durationSeconds, clientTempId, replyToMessageId = null, isForwarded = false, storyId = null, storyReply = null }) {
  // Room membership alone is never trusted as authorization -- a socket
  // could theoretically still be joined to a stale room, so every write
  // re-checks conversation_participants directly.
  if (!(await isParticipant(conversationId, senderId))) {
    throw new NotParticipantError();
  }

  await assertNotBlocked(conversationId, senderId);
  // Day 102: a new account writes to a few strangers a day.
  await spamService.checkMessage(conversationId, senderId);

  // Per (sender, conversation) rather than per-sender globally, so a burst
  // in one conversation can't be used to argue the limit is unfairly
  // blocking an unrelated one. Same budget for text and voice sends --
  // one shared counter per (sender, conversation), not one each.
  if (isRateLimited(senderId, conversationId)) {
    throw new RateLimitError();
  }

  const result = await db.query(
    `INSERT INTO messages (conversation_id, sender_id, content, client_temp_id, type, media_url, duration_seconds, reply_to_message_id, is_forwarded, story_id, story_reply)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [conversationId, senderId, content ?? null, clientTempId || null, type, mediaUrl || null, durationSeconds ?? null, replyToMessageId, isForwarded, storyId, storyReply]
  );
  // Days 97-98: a new message brings an archived chat back to the inbox
  // (Messenger) -- except for someone who also muted it: they asked for quiet.
  await db.query(
    `UPDATE conversation_participants SET archived_at = NULL
     WHERE conversation_id = $1 AND archived_at IS NOT NULL AND (muted_until IS NULL OR muted_until <= now())`,
    [conversationId]
  );
  // Day 22: a push to participants who aren't in the app right now.
  pushNewMessage({ conversationId, senderId });
  // Every new message goes out with its reply preview already attached, so
  // a new_message broadcast renders the quote without another fetch.
  const [withPreview] = await attachReplyPreviews(conversationId, result.rows);
  return withPreview;
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

module.exports = {
  MAX_MESSAGE_LENGTH,
  MAX_CLIENT_TEMP_ID_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  MessageValidationError,
  NotParticipantError,
  RateLimitError,
  MessageNotFoundError,
  NotMessageOwnerError,
  NotEditableError,
  BlockedError,
  messageText,
  isParticipant,
  getConversationType,
  assertNotBlocked,
  validateClientTempId,
  createMessage,
  validateReplyTo
};
