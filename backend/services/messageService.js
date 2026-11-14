// Single source of truth for message validation + persistence. Both the
// socket 'send_message'/'mark_delivered'/'mark_read' handlers (sockets/index.js)
// and the REST endpoints (controllers/conversationController.js) call into
// this module instead of touching the DB directly, so the two transports can
// never drift -- fixing a bug or tightening a validation rule here fixes it
// for both at once.
//
// Day 116: the code lives in services/messages/ by what it does --
//   core.js      limits, error types, the checks every send shares
//                (participant, blocks / "who can message me", spam, rate
//                limit) and the one INSERT (createMessage)
//   send.js      text, voice, photo, story replies, forwarding
//   changes.js   receipts, unsend, moderator removal, edit, reactions
//   decorate.js  what is added to rows before they reach a client
// This file is still the one the rest of the app requires (and the one
// tests spy on), with the same names as before.
const core = require('./messages/core');
const send = require('./messages/send');
const changes = require('./messages/changes');
const decorate = require('./messages/decorate');

module.exports = {
  sendMessage: send.sendMessage,
  sendVoiceMessage: send.sendVoiceMessage,
  sendImageMessage: send.sendImageMessage,
  editMessage: changes.editMessage,
  attachReplyPreviews: decorate.attachReplyPreviews,
  attachReactions: decorate.attachReactions,
  openDirectChat: send.openDirectChat,
  storyReplyContent: send.storyReplyContent,
  sendStoryReply: send.sendStoryReply,
  setReaction: changes.setReaction,
  forwardMessage: send.forwardMessage,
  MAX_FORWARD_TARGETS: send.MAX_FORWARD_TARGETS,
  markDelivered: changes.markDelivered,
  markRead: changes.markRead,
  deleteMessage: changes.deleteMessage,
  removeMessageAsModerator: changes.removeMessageAsModerator,
  isParticipant: core.isParticipant,
  getConversationType: core.getConversationType,
  messageText: core.messageText,
  scrubDeletedContent: decorate.scrubDeletedContent,
  MessageValidationError: core.MessageValidationError,
  NotParticipantError: core.NotParticipantError,
  RateLimitError: core.RateLimitError,
  MessageNotFoundError: core.MessageNotFoundError,
  NotMessageOwnerError: core.NotMessageOwnerError,
  BlockedError: core.BlockedError,
  NotEditableError: core.NotEditableError,
  MESSAGE_EDIT_WINDOW_MS: core.MESSAGE_EDIT_WINDOW_MS,
  MAX_MESSAGE_LENGTH: core.MAX_MESSAGE_LENGTH,
  MAX_CLIENT_TEMP_ID_LENGTH: core.MAX_CLIENT_TEMP_ID_LENGTH
};
