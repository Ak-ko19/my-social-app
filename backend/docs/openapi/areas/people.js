// Day 67: the API spec -- profiles, following and friends, blocking,
// muting, restricting, close friends, suggestions, search, notifications,
// hidden words and your activity.
const { s, ref, body, multipart, file, json, text, empty, op, q, pageQuery } = require('../helpers');

const BAD_ID = text('Invalid user ID');
const NOTIFICATION_CATEGORIES = ['likes', 'comments', 'mentions', 'follows', 'follow_accepted', 'messages', 'groups', 'pages', 'events'];
const USER_NOT_FOUND = text('User not found');
// Lists of someone's people: hidden when the account is private (unless you
// follow it), deactivated, or there is a block between you.
const CONNECTIONS_ACCESS = {
  400: BAD_ID,
  403: text('This account is private'),
  404: text('User not found (also when deactivated or there is a block between you)')
};
const pageOf = (key, item, description) => json(s.object({ page: s.int(), [key]: s.array(item), hasMore: s.bool() }), description);
const listedUser = (at) => s.object({ id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()), [at]: s.time() });

module.exports = {
  // ---- Profiles ----
  'GET /profile/me': op({
    tag: 'Profiles', auth: 'user',
    summary: 'Your own account',
    responses: { 200: json(ref('MyProfile'), 'Your account'), 404: USER_NOT_FOUND }
  }),
  'GET /profile/export': op({
    tag: 'Account', auth: 'user', limited: true,
    summary: 'Download a copy of everything in your account (JSON file)',
    description: 'Profile, posts, comments, reactions, messages, followers and settings, as one attachment. Never includes the '
      + 'password. Limit: 5 downloads an hour.',
    responses: {
      200: json(s.object({ exported_at: s.time(), profile: s.object({ username: s.str() }) }, { description: 'The export (many more sections)' }), 'The file (Content-Disposition: attachment)'),
      404: USER_NOT_FOUND
    }
  }),
  'GET /profile/:id': op({
    tag: 'Profiles', auth: 'optional',
    summary: "Someone's profile",
    description: 'Hidden (404) when the account is deactivated or there is a block between you. A private account still shows '
      + 'its profile; its posts and lists need an accepted follow.',
    pathParams: { id: s.str('A user id or a username (case-insensitive)') },
    responses: { 200: json(ref('Profile'), 'The profile'), 404: USER_NOT_FOUND }
  }),
  'PUT /profile': op({
    tag: 'Profiles', auth: 'user', upload: true,
    summary: 'Edit your profile (and optionally the picture)',
    description: 'Changing the email marks it unverified until the new address is verified. A replaced picture is deleted.',
    requestBody: multipart({
      username: s.str('Unique'),
      email: s.str('Unique'),
      bio: s.str('Up to 500 characters; empty removes it'),
      links: s.str('A JSON array of up to 3 web addresses (http/https), e.g. ["example.com"]; leave out to keep the current ones'),
      avatar: file('A new profile picture')
    }, { required: ['username', 'email'] }),
    responses: {
      200: json(ref('UpdatedProfile'), 'Saved'),
      400: text('Username and email are required / Invalid bio / bio too long / Invalid email format / invalid links / taken email or username, or a refused picture')
    }
  }),
  'PUT /profile/cover': op({
    tag: 'Profiles', auth: 'user', upload: true,
    summary: 'Set your cover photo',
    requestBody: multipart({ cover: file('The photo') }, { required: ['cover'] }),
    responses: { 200: json(s.object({ cover_url: s.str() }), 'Saved'), 400: text('Choose a photo, or a refused file') }
  }),
  'DELETE /profile/cover': op({
    tag: 'Profiles', auth: 'user',
    summary: 'Remove your cover photo',
    responses: { 200: json(s.object({ cover_url: { type: 'null' } }), 'Removed') }
  }),
  'PUT /profile/pinned-post': op({
    tag: 'Profiles', auth: 'user',
    summary: 'Pin one of your posts to the top of your profile',
    requestBody: body({ postId: s.id('One of your own posts') }, { required: ['postId'] }),
    responses: {
      200: json(s.object({ pinned_post_id: s.id() }), 'Pinned (replaces any earlier pin)'),
      400: text('postId is required'),
      404: text('Post not found (or not yours)')
    }
  }),
  'DELETE /profile/pinned-post': op({
    tag: 'Profiles', auth: 'user',
    summary: 'Unpin your pinned post',
    responses: { 200: json(s.object({ pinned_post_id: { type: 'null' } }), 'Unpinned') }
  }),
  'PUT /profile/privacy': op({
    tag: 'Profiles', auth: 'user',
    summary: 'Make your account private or public',
    description: 'Private: new followers need your approval (GET /follow-requests), and only followers see your posts and lists.',
    requestBody: body({ isPrivate: s.bool() }, { required: ['isPrivate'] }),
    responses: { 200: json(s.object({ id: s.id(), is_private: s.bool() }), 'Saved'), 400: text('isPrivate must be true or false') }
  }),
  'PUT /profile/language': op({
    tag: 'Profiles', auth: 'user',
    summary: "Save the app's language on your account (follows you to other devices)",
    requestBody: body({ language: s.enum(['en', 'ar']) }, { required: ['language'] }),
    responses: {
      200: json(s.object({ language: s.enum(['en', 'ar']) }), 'Saved'),
      400: text('language must be one of: en, ar'),
      404: USER_NOT_FOUND
    }
  }),
  'PUT /profile/interactions': op({
    tag: 'Profiles', auth: 'user',
    summary: 'Who may message you and who may comment on your posts',
    requestBody: body({
      messagePermission: s.enum(['everyone', 'following', 'nobody'], 'following: only people you follow'),
      commentPermission: s.enum(['everyone', 'followers', 'following'])
    }, { description: 'Send one or both' }),
    responses: {
      200: json(s.object({ message_permission: s.str(), comment_permission: s.str() }), 'Saved'),
      400: text('Nothing to update / a value that is not allowed')
    }
  }),

  // ---- Following and friends ----
  'POST /users/:id/follow': op({
    tag: 'Following', auth: 'user', limited: true,
    summary: 'Follow someone (or ask to, if their account is private)',
    description: 'They are notified (follow, or follow request).',
    responses: {
      201: json(s.object({ status: s.enum(['accepted', 'pending'], 'pending: a request to a private account') }), 'Followed or requested'),
      400: text('Invalid user ID / You cannot follow yourself / already following or requested'),
      403: text('You cannot follow this user (a block between you)'),
      404: USER_NOT_FOUND
    }
  }),
  'DELETE /users/:id/follow': op({
    tag: 'Following', auth: 'user',
    summary: 'Unfollow someone (or cancel a follow request)',
    responses: { 200: text('User unfollowed successfully'), 400: BAD_ID, 404: text('You are not following this user') }
  }),
  'GET /users/:id/follow-counts': op({
    tag: 'Following', auth: 'public',
    summary: 'How many followers, following and friends they have',
    description: 'Friends follow each other. Deactivated accounts are not counted.',
    responses: {
      200: json(s.object({
        userId: s.str('The id as it was asked for (a string)'),
        followersCount: s.int(), followingCount: s.int(), friendsCount: s.int()
      }), 'The counts'),
      400: BAD_ID
    }
  }),
  'GET /users/:id/connections': op({
    tag: 'Following', auth: 'optional',
    summary: 'Their friends, followers or following, a page at a time',
    description: 'Sorted by username, with your relationship to each person.',
    query: {
      type: q(s.enum(['friends', 'followers', 'following'], 'Default friends')),
      q: q(s.str('Only usernames containing this (first 100 characters)')),
      ...pageQuery({ defaultLimit: 30, maxLimit: 100 })
    },
    responses: {
      200: json(s.object({ users: s.array(ref('ConnectionUser')), page: s.int(), hasMore: s.bool() }), 'One page'),
      ...CONNECTIONS_ACCESS,
      400: text('Invalid user ID / type must be one of: friends, followers, following')
    }
  }),
  'GET /users/:id/mutual-friends': op({
    tag: 'Following', auth: 'optional',
    summary: 'Friends you and they have in common',
    description: 'Logged out, or for yourself: always 0.',
    responses: {
      200: json(s.object({ count: s.int(), sample: s.array(ref('UserCard'), 'A few of them') }), 'The mutual friends'),
      ...CONNECTIONS_ACCESS
    }
  }),
  'GET /follow-requests': op({
    tag: 'Following', auth: 'user',
    summary: 'People asking to follow your private account, newest first',
    responses: { 200: json(s.array(listedUser('created_at')), 'The requests') }
  }),
  'POST /follow-requests/:followerId/approve': op({
    tag: 'Following', auth: 'user',
    summary: 'Approve a follow request',
    description: 'They are notified.',
    pathParams: { followerId: s.id('Who asked') },
    responses: { 200: text('Follow request approved'), 400: BAD_ID, 404: text('No pending follow request from this user') }
  }),
  'DELETE /follow-requests/:followerId': op({
    tag: 'Following', auth: 'user',
    summary: 'Decline a follow request',
    pathParams: { followerId: s.id('Who asked') },
    responses: { 200: text('Follow request denied'), 400: BAD_ID, 404: text('No pending follow request from this user') }
  }),
  'GET /users/suggestions': op({
    tag: 'Following', auth: 'user',
    summary: 'People you may know',
    description: 'Friends of friends and people who follow you, then popular accounts; never people you follow, blocked or hid.',
    responses: { 200: json(s.array(ref('Suggestion')), 'Suggestions') }
  }),
  'POST /users/suggestions/:id/dismiss': op({
    tag: 'Following', auth: 'user',
    summary: 'Stop suggesting someone',
    responses: { 204: empty('Hidden from your suggestions'), 400: text("Invalid user ID / You can't hide yourself"), 404: USER_NOT_FOUND }
  }),

  // ---- Blocking, muting, restricting, close friends ----
  'POST /users/:id/block': op({
    tag: 'Safety', auth: 'user',
    summary: 'Block someone',
    description: 'Neither of you sees the other any more: profiles, posts, comments, search, messages. Follows both ways end.',
    responses: { 201: text('User blocked successfully'), 400: text('Invalid user ID / You cannot block yourself / already blocked'), 404: USER_NOT_FOUND }
  }),
  'DELETE /users/:id/block': op({
    tag: 'Safety', auth: 'user',
    summary: 'Unblock someone',
    responses: { 200: text('User unblocked successfully'), 400: BAD_ID, 404: text('You have not blocked this user') }
  }),
  'GET /blocked-users': op({
    tag: 'Safety', auth: 'user',
    summary: "People you've blocked, newest first",
    query: pageQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: { 200: pageOf('blockedUsers', listedUser('blocked_at'), 'One page') }
  }),
  'POST /users/:id/mute': op({
    tag: 'Safety', auth: 'user',
    summary: 'Mute someone (their posts and stories leave your Home; they are not told)',
    responses: { 201: json(s.object({ muted: { const: true } }), 'Muted'), 400: text("Invalid user ID / You can't mute yourself"), 404: USER_NOT_FOUND }
  }),
  'DELETE /users/:id/mute': op({
    tag: 'Safety', auth: 'user',
    summary: 'Unmute someone',
    responses: { 200: json(s.object({ muted: { const: false } }), 'Unmuted (also if they were not muted)'), 400: BAD_ID }
  }),
  'GET /muted-users': op({
    tag: 'Safety', auth: 'user',
    summary: "People you've muted, newest first",
    query: pageQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: { 200: pageOf('mutedUsers', listedUser('muted_at'), 'One page') }
  }),
  'POST /users/:id/restrict': op({
    tag: 'Safety', auth: 'user',
    summary: 'Restrict someone (their comments on your posts wait for your approval; they never notify you)',
    responses: { 201: json(s.object({ restricted: { const: true } }), 'Restricted'), 400: text("Invalid user ID / You can't restrict yourself"), 404: USER_NOT_FOUND }
  }),
  'DELETE /users/:id/restrict': op({
    tag: 'Safety', auth: 'user',
    summary: 'Stop restricting someone',
    responses: { 200: json(s.object({ restricted: { const: false } }), 'Done (also if they were not restricted)'), 400: BAD_ID }
  }),
  'GET /restricted-users': op({
    tag: 'Safety', auth: 'user',
    summary: "People you've restricted, newest first",
    query: pageQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: { 200: pageOf('restrictedUsers', listedUser('restricted_at'), 'One page') }
  }),
  'GET /close-friends': op({
    tag: 'Safety', auth: 'user',
    summary: 'Your close friends (who sees your close-friends posts and stories)',
    query: pageQuery({ defaultLimit: 50, maxLimit: 100 }),
    responses: { 200: pageOf('closeFriends', listedUser('added_at'), 'One page') }
  }),
  'GET /close-friends/candidates': op({
    tag: 'Safety', auth: 'user',
    summary: 'Followers you could add to close friends',
    query: { q: q(s.str('Filter by username (first 100 characters)')), ...pageQuery({ defaultLimit: 20, maxLimit: 50 }) },
    responses: { 200: pageOf('candidates', ref('UserCard'), 'One page, by username') }
  }),
  'PUT /close-friends/:id': op({
    tag: 'Safety', auth: 'user',
    summary: 'Add a follower to your close friends',
    responses: {
      200: json(s.object({ closeFriend: { const: true } }), 'Added'),
      400: text("Invalid user ID / You can't add yourself / You can add people who follow you")
    }
  }),
  'DELETE /close-friends/:id': op({
    tag: 'Safety', auth: 'user',
    summary: 'Remove someone from your close friends',
    responses: { 200: json(s.object({ closeFriend: { const: false } }), 'Removed'), 400: BAD_ID }
  }),

  // ---- Search ----
  'GET /search/users': op({
    tag: 'Search', auth: 'optional',
    summary: 'Find people by username (up to 20)',
    query: { q: q(s.str('What to look for'), true) },
    responses: {
      200: json(s.array(s.object({ id: s.id(), username: s.str(), bio: s.nullable(s.str()), avatar_url: s.nullable(s.str()), is_following: s.bool() })), 'Best matches first'),
      400: text('Search query is required')
    }
  }),
  'GET /search/posts': op({
    tag: 'Search', auth: 'optional',
    summary: 'Find posts you may see by their text',
    description: 'Any language; Burmese typed in Zawgyi is matched as Unicode.',
    query: { q: q(s.str(), true), ...pageQuery({ defaultLimit: 10, maxLimit: 50 }) },
    responses: {
      200: json(s.object({ page: s.int(), limit: s.int(), posts: s.array(ref('Post')), hasMore: s.bool() }), 'One page'),
      400: text('Search query is required')
    }
  }),
  'GET /search/hashtags': op({
    tag: 'Search', auth: 'optional',
    summary: 'Find hashtags (up to 20), with how many posts you may see use each',
    query: { q: q(s.str('With or without #'), true) },
    responses: {
      200: json(s.array(s.object({ tag: s.str(), post_count: s.int(), capped: s.bool('true: at least 500 (counting stops there)') })), 'The hashtags'),
      400: text('Search query is required')
    }
  }),
  'GET /search/history': op({
    tag: 'Search', auth: 'user',
    summary: 'Your recent searches (up to 20), newest first',
    responses: { 200: json(s.array(s.object({ id: s.id(), query: s.str(), searched_at: s.time() })), 'Your searches') }
  }),
  'POST /search/history': op({
    tag: 'Search', auth: 'user',
    summary: 'Remember a search (only the newest 20 are kept)',
    requestBody: body({ query: s.str('Up to 100 characters') }, { required: ['query'] }),
    responses: { 204: empty('Saved'), 400: text('Search query is required / A search can be at most 100 characters') }
  }),
  'DELETE /search/history': op({
    tag: 'Search', auth: 'user',
    summary: 'Clear your search history',
    responses: { 204: empty('Cleared') }
  }),
  'DELETE /search/history/:id': op({
    tag: 'Search', auth: 'user',
    summary: 'Remove one search from your history',
    responses: { 204: empty('Removed'), 400: text('Invalid search id'), 404: text('Search not found') }
  }),

  // ---- Notifications ----
  'GET /notifications': op({
    tag: 'Notifications', auth: 'user',
    summary: 'Your notifications, newest first',
    query: pageQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: { 200: json(s.object({ page: s.int(), limit: s.int(), notifications: s.array(ref('Notification')) }), 'One page') }
  }),
  'GET /notifications/unread-count': op({
    tag: 'Notifications', auth: 'user',
    summary: 'How many notifications you have not read',
    responses: { 200: json(s.object({ unreadCount: s.int() }), 'The count') }
  }),
  'PUT /notifications/read-all': op({
    tag: 'Notifications', auth: 'user',
    summary: 'Mark every notification read',
    responses: { 200: text('All notifications marked as read') }
  }),
  'PUT /notifications/:id/read': op({
    tag: 'Notifications', auth: 'user',
    summary: 'Mark one notification read',
    responses: {
      200: json(s.object({ id: s.id(), is_read: { const: true } }, { description: 'The notification (stored fields)' }), 'Marked'),
      400: text('Invalid notification ID'),
      404: text('Notification not found')
    }
  }),
  'GET /notification-preferences': op({
    tag: 'Notifications', auth: 'user',
    summary: 'Which kinds of notifications are on',
    responses: { 200: json(ref('NotificationPreferences'), 'Your settings') }
  }),
  'PUT /notification-preferences': op({
    tag: 'Notifications', auth: 'user',
    summary: 'Turn kinds of notifications on or off',
    description: 'Only the categories you send change. Off means no notification and no push for it.',
    requestBody: body(Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, s.bool()])), { description: 'Any of the categories, true or false' }),
    responses: { 200: json(ref('NotificationPreferences'), 'Your settings now'), 400: text('Send true/false for any of the categories') }
  }),

  // ---- Hidden words ----
  'GET /hidden-words': op({
    tag: 'Safety', auth: 'user',
    summary: 'Your hidden words and what happens to comments and messages that use them',
    responses: {
      200: json(s.object({ mode: s.enum(['off', 'warn', 'hide']), words: s.array(s.str(), 'Newest first') }), 'Your settings'),
      404: USER_NOT_FOUND
    }
  }),
  'PUT /hidden-words/mode': op({
    tag: 'Safety', auth: 'user',
    summary: 'Off, warn (cover them) or hide',
    requestBody: body({ mode: s.enum(['off', 'warn', 'hide']) }, { required: ['mode'] }),
    responses: {
      200: json(s.object({ mode: s.enum(['off', 'warn', 'hide']) }), 'Saved'),
      400: text('mode must be one of: off, warn, hide'),
      404: USER_NOT_FOUND
    }
  }),
  'POST /hidden-words': op({
    tag: 'Safety', auth: 'user',
    summary: 'Add a hidden word or phrase (up to 100)',
    description: 'Stored lower-case with spaces tidied, so "Spam  Offer" and "spam offer" are the same word.',
    requestBody: body({ word: s.str('Up to 40 characters') }, { required: ['word'] }),
    responses: {
      201: json(s.object({ word: s.str('As stored'), words: s.array(s.str()) }), 'Added (or already there)'),
      400: text('Enter a word or phrase / too long / You can hide at most 100 words')
    }
  }),
  'DELETE /hidden-words/:word': op({
    tag: 'Safety', auth: 'user',
    summary: 'Remove a hidden word',
    pathParams: { word: s.str('The word (URL-encoded)') },
    responses: { 200: json(s.object({ words: s.array(s.str()) }), 'Your words now') }
  }),

  // ---- Your activity ----
  'GET /activity/likes': op({
    tag: 'Activity', auth: 'user',
    summary: 'Posts you reacted to and comments you liked, newest first',
    query: pageQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: {
      200: pageOf('items', s.object({
        kind: s.enum(['post', 'comment']),
        reaction: s.nullable(s.str('Your reaction (kind post)')),
        created_at: s.time(),
        comment_id: s.nullable(s.id()), comment_content: s.nullable(s.str('First 140 characters')), comment_author: s.nullable(s.str()),
        post_id: s.id(), post_content: s.nullable(s.str('First 140 characters')),
        post_author_id: s.id(), post_author: s.str(), post_author_avatar: s.nullable(s.str())
      }), 'One page')
    }
  }),
  'GET /activity/comments': op({
    tag: 'Activity', auth: 'user',
    summary: 'Your comments and replies, newest first',
    query: pageQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: {
      200: pageOf('items', s.object({
        id: s.id(), content: s.str('First 140 characters'), created_at: s.time(), is_reply: s.bool(),
        post_id: s.id(), post_content: s.nullable(s.str()), post_author_id: s.id(), post_author: s.str(), post_author_avatar: s.nullable(s.str())
      }), 'One page')
    }
  })
};
