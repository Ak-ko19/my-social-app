// Day 116: every way a message is sent -- text, voice note, photo, a reply
// or reaction to a story (and the direct chat it opens), and forwarding.
// Each validates its own input and then goes through core.createMessage,
// so all of them share the same checks. Split out of messageService.js.
const db = require('../../db');
const interactionService = require('../interactionService');
const { cloudinaryAsset } = require('../mediaCleanupService');
const cloudinary = require('../../config/cloudinary');
const { toUnicode } = require('../../utils/myanmarText');
const { STORY_REACTIONS } = require('../../config/storyReactions');
const {
  MAX_MESSAGE_LENGTH,
  MessageValidationError,
  NotParticipantError,
  RateLimitError,
  MessageNotFoundError,
  NotEditableError,
  BlockedError,
  messageText,
  isParticipant,
  assertNotBlocked,
  validateClientTempId,
  createMessage,
  validateReplyTo
} = require('./core');

async function sendMessage({ conversationId, senderId, content, clientTempId, replyToMessageId }) {
  const convId = parseInt(conversationId, 10);
  if (isNaN(convId)) {
    throw new MessageValidationError('Invalid conversation ID');
  }

  const cleaned = messageText(content);
  if (!cleaned) {
    throw new MessageValidationError('Message content cannot be empty');
  }
  if (cleaned.length > MAX_MESSAGE_LENGTH) {
    throw new MessageValidationError(`Message content must be under ${MAX_MESSAGE_LENGTH} characters`);
  }

  validateClientTempId(clientTempId);

  const replyTo = await validateReplyTo(convId, replyToMessageId);
  return createMessage({ conversationId: convId, senderId, type: 'text', content: toUnicode(cleaned), clientTempId, replyToMessageId: replyTo });
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

// Day 100: the direct chat between two people, opened when there is none
// yet -- { conversation, created }. A new chat needs the other person to
// accept messages from you (Day 47); an existing one opens either way, and
// every send re-checks. Two requests racing to open the same chat both get
// the one row (idx_conversations_direct_unique_pair). The caller joins the
// sockets' rooms when created (sockets/ requires this module).
async function openDirectChat(userId, otherUserId) {
  const pair = [Math.min(userId, otherUserId), Math.max(userId, otherUserId)];
  const find = async () =>
    (await db.query(`SELECT * FROM conversations WHERE type = 'direct' AND user_a_id = $1 AND user_b_id = $2`, pair)).rows[0];
  const existing = await find();
  if (existing) return { conversation: existing, created: false };
  if (!(await interactionService.canMessage(userId, otherUserId))) {
    throw new BlockedError("This person isn't accepting messages from you");
  }
  let conversation;
  try {
    conversation = (await db.query(`INSERT INTO conversations (type, user_a_id, user_b_id) VALUES ('direct', $1, $2) RETURNING *`, pair)).rows[0];
  } catch (err) {
    if (err.code !== '23505') throw err;
    return { conversation: await find(), created: false };
  }
  await db.query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)', [
    conversation.id,
    userId,
    otherUserId
  ]);
  return { conversation, created: true };
}

// Day 100: the text of a reply ('reply', text) or a reaction ('reaction',
// one of STORY_REACTIONS) to a story -- checked before any chat is opened,
// so a refused one never leaves an empty chat behind. A reply follows the
// rules of any text message (length, Zawgyi as Unicode).
function storyReplyContent(kind, { text, emoji }) {
  if (kind === 'reaction') {
    if (!STORY_REACTIONS.includes(emoji)) throw new MessageValidationError('Choose one of the story reactions');
    return emoji;
  }
  const cleaned = messageText(text);
  if (!cleaned) throw new MessageValidationError('Message content cannot be empty');
  if (cleaned.length > MAX_MESSAGE_LENGTH) {
    throw new MessageValidationError(`Message content must be under ${MAX_MESSAGE_LENGTH} characters`);
  }
  return toUnicode(cleaned);
}

// Day 100: send it to story `storyId`'s author in chat `conversationId`
// (the caller has checked the story and opened the chat), with every
// createMessage check.
function sendStoryReply({ conversationId, senderId, storyId, kind, content }) {
  return createMessage({ conversationId, senderId, type: 'text', content, storyId, storyReply: kind });
}

// Day 32: forward a message to up to MAX_FORWARD_TARGETS chats. Each copy
// is a new message from the forwarder (labelled is_forwarded; who wrote the
// original is not carried over), sent through createMessage, so every
// target gets the same checks as a normal send -- being in it, blocks, the
// send rate limit -- and a push. Targets succeed or fail independently.
const MAX_FORWARD_TARGETS = 5;

// A photo or voice note on our Cloudinary is copied for each forward, so
// every message owns its file: unsending one, deleting an account or the
// orphan scan never breaks another. Anything else (an old local path) is
// never deleted by us, so it is reused as-is.
async function copyMediaForForward(url, type) {
  if (!url || !cloudinaryAsset(url)) return url;
  const result = await cloudinary.uploader.upload(url, {
    folder: type === 'voice' ? 'voice-messages' : 'message-images',
    resource_type: type === 'voice' ? 'video' : 'image'
  });
  return result.secure_url;
}

function forwardFailure(err) {
  if (err instanceof NotParticipantError) return { status: 403, error: err.message };
  if (err instanceof BlockedError) return { status: 403, error: err.message };
  if (err instanceof RateLimitError) return { status: 429, error: err.message };
  return { status: 502, error: 'Forwarding to this chat failed. Please try again.' };
}

async function forwardMessage({ conversationId, messageId, userId, targetIds }) {
  const convId = parseInt(conversationId, 10);
  const msgId = parseInt(messageId, 10);
  if (isNaN(convId) || isNaN(msgId)) {
    throw new MessageValidationError('Invalid conversationId or messageId');
  }
  if (!Array.isArray(targetIds) || targetIds.length === 0) {
    throw new MessageValidationError('Choose at least one chat');
  }
  const targets = [...new Set(targetIds.map(Number))];
  if (targets.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new MessageValidationError('Invalid chat id');
  }
  if (targets.length > MAX_FORWARD_TARGETS) {
    throw new MessageValidationError(`You can forward to up to ${MAX_FORWARD_TARGETS} chats at once`);
  }
  if (!(await isParticipant(convId, userId))) {
    throw new NotParticipantError();
  }
  const found = await db.query('SELECT * FROM messages WHERE id = $1 AND conversation_id = $2', [msgId, convId]);
  if (found.rows.length === 0) {
    throw new MessageNotFoundError();
  }
  const original = found.rows[0];
  if (original.deleted_at) {
    throw new NotEditableError("A deleted message can't be forwarded");
  }

  const forwarded = [];
  const failed = [];
  for (const targetId of targets) {
    try {
      // Checked before copying any file, so a refused chat costs nothing.
      if (!(await isParticipant(targetId, userId))) throw new NotParticipantError();
      await assertNotBlocked(targetId, userId);
      const mediaUrl = await copyMediaForForward(original.media_url, original.type);
      const message = await createMessage({
        conversationId: targetId,
        senderId: userId,
        type: original.type,
        content: original.content,
        mediaUrl,
        durationSeconds: original.duration_seconds,
        isForwarded: true
      });
      forwarded.push({ ...message, reactions: [] });
    } catch (err) {
      failed.push({ conversationId: targetId, ...forwardFailure(err) });
    }
  }
  return { forwarded, failed };
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
  const cleanedCaption = messageText(caption);
  if (cleanedCaption.length > MAX_MESSAGE_LENGTH) {
    throw new MessageValidationError(`Caption must be under ${MAX_MESSAGE_LENGTH} characters`);
  }
  validateClientTempId(clientTempId);
  const replyTo = await validateReplyTo(convId, replyToMessageId);
  return createMessage({
    conversationId: convId,
    senderId,
    type: 'image',
    content: toUnicode(cleanedCaption) || null,
    mediaUrl,
    clientTempId,
    replyToMessageId: replyTo
  });
}

module.exports = {
  sendMessage,
  sendVoiceMessage,
  sendImageMessage,
  openDirectChat,
  storyReplyContent,
  sendStoryReply,
  forwardMessage,
  MAX_FORWARD_TARGETS
};
