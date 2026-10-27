// Day 68: the API spec -- direct and group conversations, messages (text,
// voice, photos), replies, edits, reactions, forwarding, read and mute.
// Every message is also broadcast live over Socket.IO (docs/REALTIME.md).
const { s, ref, body, multipart, file, json, text, op, q, cursorQuery } = require('../helpers');

const BAD_CONVERSATION = text('Invalid conversation ID');
const NOT_PARTICIPANT = text('You are not a participant in this conversation');
const MESSAGE_FIELDS = {
  clientTempId: s.str('Your own id for the optimistic copy; echoed back as client_temp_id'),
  replyToMessageId: s.id('Reply to this message (in the same conversation)')
};
const SEND_REFUSED = {
  400: text('Empty or too long (5000 characters), or a bad reply'),
  403: text('You are not a participant / You cannot message this user (a block) / This person isn\'t accepting messages from you'),
  429: text('You are sending messages too quickly. Please slow down. / Day 102: an account in its first day writes to up to 5 people a day who don’t follow it')
};
const MEMBERS = json(s.object({ members: s.array(ref('GroupMember')) }), 'The members now');
const GROUP_REFUSED = (action) => ({
  400: text('Invalid id, or not a group conversation'),
  403: text(`You are not a participant / Only group admins can ${action}`)
});

module.exports = {
  'GET /conversations': op({
    tag: 'Messages', auth: 'user',
    summary: 'Your chats (direct and group): pinned first, then most recent activity, a page at a time',
    description: 'A chat with no messages yet counts from when it was made. `id` answers just that one chat (same shape). '
      + 'Days 97-98: pinned chats (up to 3, the most recently pinned first) are all on the first page; archived chats are '
      + 'left out (archived=1 lists only them). The inbox\'s first page says how many are archived (archivedCount).',
    query: {
      ...cursorQuery({ defaultLimit: 20, maxLimit: 50 }),
      q: q(s.str("Only chats whose name (a group's, or the other person's username) contains this")),
      id: q(s.id('Just this chat')),
      archived: q(s.enum(['0', '1'], '1: your archived chats instead of the inbox'))
    },
    responses: {
      200: json(s.object({
        conversations: s.array(ref('ConversationSummary')),
        nextCursor: s.nullable(s.str('null: no more chats')),
        archivedCount: s.int('How many chats you archived (the inbox\'s first page only)')
      }, { optional: ['archivedCount'] }), 'One page'),
      400: text('Invalid cursor / Invalid conversation ID / archived must be 0 or 1'),
      404: text('Conversation not found (with id: not one of yours)')
    }
  }),
  'POST /conversations': op({
    tag: 'Messages', auth: 'user',
    summary: 'Open a direct chat with someone (the existing one if there is one)',
    description: 'A new chat needs their message setting to allow you; an existing one always opens (sending is checked every time).',
    requestBody: body({ userId: s.id() }, { required: ['userId'] }),
    responses: {
      201: json(s.object({ id: s.id(), type: { const: 'direct' }, other_user_id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()) }), 'A new chat'),
      200: json(s.object({ id: s.id(), type: { const: 'direct' }, other_user_id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()) }), 'Your existing chat with them'),
      400: text('A valid userId is required / You cannot start a conversation with yourself'),
      403: text('You cannot message this user / This person isn\'t accepting messages from you'),
      404: text('User not found')
    }
  }),
  'POST /conversations/groups': op({
    tag: 'Messages', auth: 'user',
    summary: 'Start a group chat',
    description: 'You are its first admin. Up to 50 members including you: active accounts with no block between you (the app offers people you follow).',
    requestBody: body({ name: s.str('Up to 100 characters'), userIds: s.array(s.id(), 'At least one other person') }, { required: ['name', 'userIds'] }),
    responses: {
      201: json(s.object({ id: s.id(), type: { const: 'group' }, name: s.str(), members: s.array(ref('GroupMember')), my_role: { const: 'admin' } }), 'Created'),
      400: text('A group needs a name / too long / bad or missing people / too many members')
    }
  }),
  'GET /conversations/:id': op({
    tag: 'Messages', auth: 'user',
    summary: 'A chat\'s details and members',
    responses: {
      200: json(s.object({
        id: s.id(), type: s.enum(['direct', 'group']), name: s.nullable(s.str()), avatar_url: s.nullable(s.str()),
        created_by: s.nullable(s.id()), my_role: s.nullable(s.enum(['admin', 'member'])),
        muted: s.bool(), muted_until: s.nullable(s.time('null while muted means "until I unmute"')),
        members: s.array(ref('GroupMember'))
      }), 'The chat'),
      400: BAD_CONVERSATION,
      403: NOT_PARTICIPANT
    }
  }),
  'PATCH /conversations/:id': op({
    tag: 'Messages', auth: 'user',
    summary: 'Rename a group',
    requestBody: body({ name: s.str('Up to 100 characters') }, { required: ['name'] }),
    responses: { 200: json(s.object({ id: s.id(), name: s.str() }), 'Renamed'), ...GROUP_REFUSED('rename the group') }
  }),
  'POST /conversations/:id/members': op({
    tag: 'Messages', auth: 'user',
    summary: 'Add people to a group',
    requestBody: body({ userIds: s.array(s.id()) }, { required: ['userIds'] }),
    responses: {
      200: json(s.object({ members: s.array(ref('GroupMember')), added: s.array(s.id('Who was actually added')) }), 'Added'),
      ...GROUP_REFUSED('add people')
    }
  }),
  'DELETE /conversations/:id/members/:userId': op({
    tag: 'Messages', auth: 'user',
    summary: 'Remove someone from a group, or leave it (your own id)',
    description: 'If the last admin leaves, the longest-standing member becomes admin; when the last member leaves, the group is deleted.',
    pathParams: { userId: s.id('Who to remove; your own id to leave') },
    responses: {
      200: json(s.object({ members: s.array(ref('GroupMember')), deleted: s.bool('true: that was the last member, the group is gone') }), 'Done'),
      ...GROUP_REFUSED('remove people'),
      404: text('That person is not in this group')
    }
  }),
  'PATCH /conversations/:id/members/:userId': op({
    tag: 'Messages', auth: 'user',
    summary: 'Make a member an admin, or an admin a member',
    pathParams: { userId: s.id('The member') },
    requestBody: body({ role: s.enum(['admin', 'member']) }, { required: ['role'] }),
    responses: {
      200: MEMBERS,
      ...GROUP_REFUSED('change who is an admin'),
      404: text('That person is not in this group'),
      409: text('A group needs at least one admin')
    }
  }),
  'PUT /conversations/:id/photo': op({
    tag: 'Messages', auth: 'user', upload: true,
    summary: "Set a group's photo",
    requestBody: multipart({ photo: file('The photo') }, { required: ['photo'] }),
    responses: { 200: json(s.object({ avatar_url: s.str() }), 'Saved'), ...GROUP_REFUSED('change the group photo'), 400: text('Choose a photo, a refused file, or not a group') }
  }),
  'DELETE /conversations/:id/photo': op({
    tag: 'Messages', auth: 'user',
    summary: "Remove a group's photo",
    responses: { 200: json(s.object({ avatar_url: { type: 'null' } }), 'Removed'), ...GROUP_REFUSED('change the group photo') }
  }),
  'GET /conversations/:id/messages': op({
    tag: 'Messages', auth: 'user',
    summary: 'Messages, a page at a time (newest page first, each page oldest-first)',
    description: 'Unsent messages keep their place without their content. Pass nextCursor back for older messages.',
    query: cursorQuery({ defaultLimit: 20, maxLimit: 100 }),
    responses: {
      200: json(s.object({ messages: s.array(ref('Message')), nextCursor: s.nullable(s.str('null: no older messages')) }), 'One page'),
      400: text('Invalid conversation ID / Invalid cursor'),
      403: NOT_PARTICIPANT
    }
  }),
  'POST /conversations/:id/messages': op({
    tag: 'Messages', auth: 'user',
    summary: 'Send a text message',
    description: 'Sending over the socket (send_message) does the same; either way everyone in the chat gets new_message.',
    requestBody: body({ content: s.str('Up to 5000 characters'), ...MESSAGE_FIELDS }, { required: ['content'] }),
    responses: { 201: json(ref('Message'), 'Sent'), ...SEND_REFUSED }
  }),
  'POST /conversations/:id/messages/voice': op({
    tag: 'Messages', auth: 'user', upload: true,
    summary: 'Send a voice message',
    description: 'Stored as MP3 so every browser can play it.',
    requestBody: multipart({ audio: file('WEBM, MP4, OGG or MPEG audio, up to 5 MB'), clientTempId: MESSAGE_FIELDS.clientTempId }, { required: ['audio'] }),
    responses: { 201: json(ref('Message'), 'Sent'), ...SEND_REFUSED, 400: text('An audio file is required (field name "audio"), or a refused file') }
  }),
  'POST /conversations/:id/messages/image': op({
    tag: 'Messages', auth: 'user', upload: true,
    summary: 'Send a photo (with an optional caption)',
    requestBody: multipart({ image: file('The photo'), caption: s.str('Up to 5000 characters'), ...MESSAGE_FIELDS }, { required: ['image'] }),
    responses: { 201: json(ref('Message'), 'Sent'), ...SEND_REFUSED, 400: text('An image file is required (field name "image"), a bad caption or reply, or a refused file') }
  }),
  'PUT /conversations/:id/messages/:messageId': op({
    tag: 'Messages', auth: 'user',
    summary: 'Edit your text message (within 15 minutes)',
    pathParams: { messageId: s.id() },
    requestBody: body({ content: s.str('Up to 5000 characters') }, { required: ['content'] }),
    responses: {
      200: json(ref('Message'), 'Saved'),
      400: text('Empty or too long'),
      403: text("Not your message / This message can no longer be edited / A reaction to a story can't be edited"),
      404: text('Message not found')
    }
  }),
  'DELETE /conversations/:id/messages/:messageId': op({
    tag: 'Messages', auth: 'user',
    summary: 'Unsend your message (for everyone)',
    description: 'It stays in place as "unsent", without its content, reactions or file.',
    pathParams: { messageId: s.id() },
    responses: {
      200: json(ref('Message'), 'Unsent (content removed)'),
      400: text('Invalid ids'),
      403: text('You can only delete your own messages'),
      404: text('Message not found')
    }
  }),
  'PUT /conversations/:id/read': op({
    tag: 'Messages', auth: 'user',
    summary: 'Mark a chat read up to its newest message',
    responses: { 200: text('Conversation marked as read'), 400: BAD_CONVERSATION, 403: NOT_PARTICIPANT }
  }),
  'PUT /conversations/:id/mute': op({
    tag: 'Messages', auth: 'user',
    summary: 'Mute a chat (no notifications or pushes) for a while, or unmute it',
    requestBody: body({ duration: s.nullable(s.enum(['8h', '1w', 'always'], 'null: unmute')) }, { required: ['duration'] }),
    responses: {
      200: json(s.object({ muted: s.bool(), muted_until: s.nullable(s.time('null for "always" or when unmuted')) }), 'Saved'),
      400: text('Invalid conversation ID / duration must be one of: 8h, 1w, always, or null'),
      404: text('Conversation not found (or not yours)')
    }
  }),
  'GET /conversations/:id/search': op({
    tag: 'Messages', auth: 'user',
    summary: 'Search inside one of your chats',
    description: 'Day 99. Text messages and photo captions containing q (not deleted ones; voice has no text), newest first, '
      + 'a page at a time. Burmese typed in Zawgyi is searched as Unicode.',
    query: {
      ...cursorQuery({ defaultLimit: 20, maxLimit: 50 }),
      q: q(s.str('2 to 100 characters'))
    },
    responses: {
      200: json(s.object({
        results: s.array(s.object({
          id: s.id(), sender_id: s.nullable(s.id()), sender_username: s.nullable(s.str()), type: s.enum(['text', 'image']),
          content: s.str(), created_at: s.time()
        })),
        nextCursor: s.nullable(s.str('null: no more'))
      }), 'One page of matches'),
      400: text('Invalid conversation ID / Search for at least 2 characters. / Invalid cursor'),
      403: NOT_PARTICIPANT
    }
  }),
  'GET /conversations/:id/messages/:messageId/context': op({
    tag: 'Messages', auth: 'user',
    summary: 'A message with the messages around it (up to 10 before and 10 after)',
    description: 'Day 99, for a search result. Oldest first, shaped like the history (reply previews, reactions; deleted ones '
      + 'without their content).',
    pathParams: { messageId: s.id() },
    responses: {
      200: json(s.object({ messageId: s.id(), messages: s.array(ref('Message')) }), 'The messages around it'),
      400: text('Invalid conversation ID / Invalid message ID'),
      403: NOT_PARTICIPANT,
      404: text('Message not found (not in this chat, or deleted)')
    }
  }),
  'PUT /conversations/:id/pin': op({
    tag: 'Messages', auth: 'user',
    summary: 'Pin a chat to the top of your inbox, or unpin it',
    description: 'Days 97-98. Yours only. Up to 3 pinned; pinning an archived chat brings it back to the inbox.',
    requestBody: body({ pinned: s.bool() }, { required: ['pinned'] }),
    responses: {
      200: json(s.object({ pinned: s.bool(), archived: s.bool() }), 'Saved'),
      400: text('Invalid conversation ID / pinned must be true or false / You can pin up to 3 chats.'),
      404: text('Conversation not found (or not yours)')
    }
  }),
  'PUT /conversations/:id/archive': op({
    tag: 'Messages', auth: 'user',
    summary: 'Archive a chat (out of your inbox) or bring it back',
    description: 'Days 97-98. Yours only. Archiving unpins it. A new message in it brings it back to your inbox -- unless you '
      + 'also muted it.',
    requestBody: body({ archived: s.bool() }, { required: ['archived'] }),
    responses: {
      200: json(s.object({ pinned: s.bool(), archived: s.bool() }), 'Saved'),
      400: text('Invalid conversation ID / archived must be true or false'),
      404: text('Conversation not found (or not yours)')
    }
  }),
  'PUT /conversations/:id/messages/:messageId/reaction': op({
    tag: 'Messages', auth: 'user', limited: true,
    summary: 'React to a message, or change your reaction',
    pathParams: { messageId: s.id() },
    requestBody: body({ reaction: s.str('One emoji') }, { required: ['reaction'] }),
    responses: {
      200: json(ref('MessageReactions'), "The message's reactions now"),
      400: text('reaction is required / not a reaction'),
      403: text('Not a participant, or a block'),
      404: text('Message not found'),
      409: text('An unsent message cannot get reactions')
    }
  }),
  'DELETE /conversations/:id/messages/:messageId/reaction': op({
    tag: 'Messages', auth: 'user', limited: true,
    summary: 'Remove your reaction from a message',
    pathParams: { messageId: s.id() },
    responses: {
      200: json(ref('MessageReactions'), "The message's reactions now"),
      400: text('Invalid ids'),
      403: text('Not a participant, or a block'),
      404: text('Message not found'),
      409: text('An unsent message cannot get reactions')
    }
  }),
  'POST /conversations/:id/messages/:messageId/forward': op({
    tag: 'Messages', auth: 'user',
    summary: 'Forward a message to up to 5 of your chats',
    description: 'Each copy is a new message from you, marked forwarded (photos and voice notes are copied). When none could be '
      + 'sent, the status is the first failure\'s.',
    pathParams: { messageId: s.id() },
    requestBody: body({ conversationIds: s.array(s.id(), '1 to 5 chats') }, { required: ['conversationIds'] }),
    responses: (() => {
      const result = s.object({
        forwarded: s.array(ref('Message')),
        failed: s.array(s.object({ conversationId: s.id(), status: s.int(), error: s.str() }))
      });
      return {
        201: json(result, 'Forwarded to at least one chat'),
        400: text('Bad ids or too many chats'),
        403: { description: 'Not a participant of the original or of every target', content: { 'text/plain': { schema: { type: 'string' } }, 'application/json': { schema: result } } },
        404: text('Message not found'),
        409: text("A deleted message can't be forwarded"),
        429: { description: 'Every target refused: sending too fast', content: { 'application/json': { schema: result } } },
        502: { description: 'Every target failed', content: { 'application/json': { schema: result } } }
      };
    })()
  })
};
