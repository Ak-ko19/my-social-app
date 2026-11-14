// Day 116: messageService.js became a front for services/messages/ (core,
// send, changes, decorate). Everything the app and the tests use from it
// is still there, under the same names -- a move, not a change.
describe('messageService (the one entry point for messages)', () => {
  const messageService = require('../../services/messageService');

  it('offers the same names as before the split, each defined', () => {
    expect(Object.keys(messageService).sort()).toEqual([
      'BlockedError', 'MAX_CLIENT_TEMP_ID_LENGTH', 'MAX_FORWARD_TARGETS', 'MAX_MESSAGE_LENGTH', 'MESSAGE_EDIT_WINDOW_MS',
      'MessageNotFoundError', 'MessageValidationError', 'NotEditableError', 'NotMessageOwnerError', 'NotParticipantError',
      'RateLimitError', 'attachReactions', 'attachReplyPreviews', 'deleteMessage', 'editMessage', 'forwardMessage',
      'getConversationType', 'isParticipant', 'markDelivered', 'markRead', 'messageText', 'openDirectChat',
      'removeMessageAsModerator', 'scrubDeletedContent', 'sendImageMessage', 'sendMessage', 'sendStoryReply',
      'sendVoiceMessage', 'setReaction', 'storyReplyContent'
    ]);
    for (const [name, value] of Object.entries(messageService)) expect([name, value]).not.toEqual([name, undefined]);
  });

  it('is the same code as services/messages/ (one error class, not a copy)', () => {
    const core = require('../../services/messages/core');
    const send = require('../../services/messages/send');
    expect(messageService.MessageValidationError).toBe(core.MessageValidationError);
    expect(messageService.sendMessage).toBe(send.sendMessage);
    expect(new core.BlockedError()).toBeInstanceOf(require('../../utils/httpError').HttpError);
    expect(messageService.MAX_MESSAGE_LENGTH).toBe(5000);
    expect(messageService.MESSAGE_EDIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});
