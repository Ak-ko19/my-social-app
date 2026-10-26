// Day 67: shared parts of the OpenAPI spec -- security schemes, the common
// error responses, and the resource schemas the area files refer to with
// ref('Name').
const { s } = require('./helpers');

// Day 95: a photo, with the description its author wrote (alt text) or null.
const MEDIA_ITEM = s.object({ url: s.str(), alt: s.nullable(s.str('The description its author wrote (alt text), for screen readers')) }, { optional: ['alt'] });

const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'The `token` from POST /login (or from a password change). Each login is a session (GET /sessions); '
      + 'a token stops working when its session is signed out, the password changes elsewhere, or the account is banned or suspended.'
  },
  cleanupSecret: {
    type: 'http',
    scheme: 'bearer',
    description: 'The server\'s CLEANUP_SECRET (machines only). Without it configured, or with a wrong one, the route answers 404.'
  }
};

const textError = (description) => ({ description, content: { 'text/plain': { schema: { type: 'string' } } } });

const responses = {
  Unauthorized: textError('Not logged in: no token, an invalid or expired token, a signed-out session, or a banned or suspended account.'),
  NotFound: textError('Not found.'),
  TooManyRequests: {
    description: 'Too many requests from this account or network; try again after `Retry-After` seconds.',
    headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until the limit resets' } },
    content: { 'text/plain': { schema: { type: 'string' } } }
  },
  BadUpload: textError('The file was refused: only JPEG, PNG, GIF and WEBP images (or the voice formats) up to 5 MB, or a field was invalid.'),
  UploadFailed: textError('Upload failed. Please try again later. (The file store did not take the file.)'),
  ServerError: textError('Something went wrong on the server (it is logged and appears in Admin > Errors).')
};

const schemas = {
  Ok: s.object({ ok: s.bool() }),
  Health: s.object({
    status: s.enum(['ok']),
    db: s.enum(['ok']),
    uptimeSeconds: s.int('Seconds since the server started')
  }),
  HealthDown: s.object({ status: s.enum(['error']), db: s.enum(['down']) }),
  Config: s.object({
    emailEnabled: s.bool('false: emails cannot be sent right now, so the app hides email-based flows'),
    turnstileSiteKey: s.nullable(s.str('The public Cloudflare Turnstile key when the human check is on, else null'))
  }),
  FormToken: s.object({ token: s.str('Send it back as `formToken` with the signup / forgot-password form') }),
  LinkPreview: s.object({
    url: s.str('The page (normalised)'),
    title: s.nullable(s.str()),
    description: s.nullable(s.str()),
    siteName: s.nullable(s.str())
  }),
  PushConfig: s.object({ publicKey: s.nullable(s.str('The VAPID public key, or null when push is off on this server')) }),
  CleanupResult: s.object({}, { description: 'What the daily cleanup removed (counts by kind); with dryRun=1, what it would remove.' }),
  NewAccount: s.object({ id: s.id(), username: s.str(), email: s.str() }),
  LoginResult: s.object({
    token: s.str('Bearer token for this new session'),
    id: s.id(),
    username: s.str(),
    email: s.str(),
    reactivated: s.bool('true: the account was deactivated and this login reactivated it'),
    emailVerified: s.bool(),
    language: s.nullable(s.enum(['en', 'ar'], "The account's app language (null: never chosen)")),
    needsOnboarding: s.bool('true: a new account that has not seen the first-run steps yet'),
    recoveryCodesLeft: s.int('Only after logging in with a recovery code: how many unused ones are left')
  }, { optional: ['recoveryCodesLeft'] }),
  TwoFactorChallenge: s.object({
    twoFactorRequired: s.bool('Always true: send a code to POST /login/2fa'),
    challengeToken: s.str('For POST /login/2fa; good for 5 minutes and one login, and for nothing else')
  }),
  Suspended: s.object({ message: s.str(), until: s.time('When the suspension ends') }),
  TwoFactorStatus: s.object({
    enabled: s.bool(),
    enabledAt: s.nullable(s.time('When it was turned on')),
    recoveryCodesLeft: s.int('Unused recovery codes (0 when off)')
  }),
  TwoFactorSetup: s.object({
    secret: s.str('The key (base32), for typing into the app by hand'),
    otpauthUrl: s.str('The otpauth://totp/ link the QR code holds'),
    qr: s.str('The QR code as an SVG data URL (data:image/svg+xml;base64,...)')
  }),
  RecoveryCodes: s.object({
    recoveryCodes: s.array(s.str(), 'One-time codes ("abcde-fghij"); shown only this once, so keep them safe')
  }),
  PasswordChanged: s.object({
    message: s.str(),
    token: s.str('Only for a token from before sessions existed: a fresh token for this device')
  }, { optional: ['token'] }),
  Session: s.object({
    id: s.str('Session id (UUID)', { format: 'uuid' }),
    created_at: s.time(),
    last_seen_at: s.time(),
    current: s.bool('This is the session making the request'),
    device: s.object({
      browser: s.nullable(s.str('e.g. "Chrome", "Edge"; null when unknown')),
      os: s.nullable(s.str('e.g. "Windows", "Android"; null when unknown')),
      kind: s.enum(['mobile', 'desktop'])
    }, { description: "Read from the browser's user agent when the session was created" })
  }),

  // ---- People ----
  UserCard: s.object({ id: s.id(), username: s.str(), avatar_url: s.nullable(s.str('Picture URL, or null for the default')) }),
  Profile: s.object({
    id: s.id(),
    username: s.str(),
    bio: s.nullable(s.str()),
    links: s.array(s.str(), 'Up to 3 web addresses'),
    avatar_url: s.nullable(s.str()),
    cover_url: s.nullable(s.str()),
    is_private: s.bool(),
    is_deactivated: s.bool('Only ever true when you look at your own deactivated profile'),
    created_at: s.time(),
    is_following: s.bool('You follow them'),
    follow_request_pending: s.bool('You asked to follow them and they have not answered'),
    follows_you: s.bool(),
    is_blocked_by_me: s.bool(),
    is_muted_by_me: s.bool(),
    is_restricted_by_me: s.bool(),
    can_message: s.bool('Their message setting lets you start a chat (false when logged out or for yourself)')
  }, { description: "Someone's public profile, with the viewer's relationship to them. Never includes the email." }),
  MyProfile: s.object({
    id: s.id(),
    username: s.str(),
    email: s.str(),
    bio: s.nullable(s.str()),
    links: s.array(s.str()),
    avatar_url: s.nullable(s.str()),
    cover_url: s.nullable(s.str()),
    is_private: s.bool(),
    email_verified: s.bool(),
    is_admin: s.bool(),
    language: s.nullable(s.enum(['en', 'ar'])),
    message_permission: s.enum(['everyone', 'following', 'nobody'], 'Who may start a chat with you'),
    comment_permission: s.enum(['everyone', 'followers', 'following'], 'Who may comment on your posts'),
    onboarded_at: s.nullable(s.time('When the first-run steps were finished or skipped (null: not yet)')),
    created_at: s.time()
  }, { description: 'Your own account, as only you see it' }),
  UpdatedProfile: s.object({
    id: s.id(), username: s.str(), email: s.str(), bio: s.nullable(s.str()), links: s.array(s.str()),
    avatar_url: s.nullable(s.str()), email_verified: s.bool('false after an email change, until the new address is verified'), created_at: s.time()
  }),
  ConnectionUser: s.object({
    id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()),
    is_following: s.bool(), request_pending: s.bool(), follows_you: s.bool()
  }),
  Suggestion: s.object({
    id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()), bio: s.nullable(s.str()), is_private: s.bool(),
    mutual_count: s.int('People you follow who follow them'),
    follows_you: s.bool(),
    mutual_sample: s.nullable(s.array(s.str(), 'Up to 2 of those mutual usernames'))
  }, { optional: ['mutual_count', 'follows_you', 'mutual_sample'], description: 'Friends of friends and people who follow you first; then popular accounts' }),
  Notification: s.object({
    id: s.id(),
    type: s.enum(['like', 'comment_like', 'comment', 'reply', 'mention', 'follow', 'follow_request', 'follow_accepted',
      'group_request', 'group_approved', 'page_admin', 'event_reminder', 'event_cancelled', 'scheduled_post', 'scheduled_failed',
      'poll_ended', 'poll_ended_own', 'new_login', 'content_removed', 'memories', 'share']),
    post_id: s.nullable(s.id()),
    comment_id: s.nullable(s.id()),
    is_read: s.bool('Day 81: for a group, true only when all of it is read'),
    created_at: s.time('The newest in the group'),
    count: s.int('Day 81: how many notifications this row groups (likes and comments per post, likes per comment, new followers per day; 1 for every other kind)'),
    actor_count: s.int('How many different people are in the group'),
    actors: s.array(s.object({ id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()) }), 'The newest few of them (at most 3), newest first'),
    actor_id: s.id('Who did it -- the newest in a group (you, for notifications about your own content)'),
    actor_username: s.str(),
    actor_avatar_url: s.nullable(s.str()),
    post_content: s.nullable(s.str("The post's text, unless you may no longer see it")),
    community_id: s.nullable(s.id()), community_name: s.nullable(s.str()),
    page_id: s.nullable(s.id()), page_name: s.nullable(s.str()),
    event_id: s.nullable(s.id()), event_name: s.nullable(s.str()), event_starts_at: s.nullable(s.time()),
    device: s.nullable(s.object({ browser: s.nullable(s.str()), os: s.nullable(s.str()), kind: s.enum(['mobile', 'desktop']) },
      { description: 'new_login: the kind of device that logged in (no IP address is kept)' })),
    details: {
      oneOf: [
        s.object({
          kind: s.enum(['post', 'comment', 'message', 'community', 'page'], 'What was removed'),
          reason: s.enum(['spam', 'harassment', 'inappropriate_content', 'hate_speech', 'misinformation', 'other'], 'The reason it was reported for'),
          excerpt: s.nullable(s.str('Its first 100 characters, as reported'))
        }, { description: 'content_removed (Day 82): an admin removed something of yours after a report' }),
        s.object({ yearsAgo: s.int('The most recent year with memories, in years ago') },
          { description: 'memories (Day 84): you have posts from this day in earlier years' }),
        { type: 'null' }
      ]
    }
  }),
  NotificationPreferences: s.object(Object.fromEntries(
    ['likes', 'comments', 'mentions', 'follows', 'follow_accepted', 'messages', 'groups', 'pages', 'events', 'memories', 'shares'].map((c) => [c, s.bool()])
  ), { description: 'Each category on (true) or off; everything starts on' }),

  // ---- Posts ----
  Post: s.object({
    id: s.id(),
    content: s.nullable(s.str()),
    visibility: s.enum(['public', 'followers', 'close_friends', 'only_me']),
    image_url: s.nullable(s.str('The first photo of an older post (newer posts use media)')),
    created_at: s.time(),
    user_id: s.id('The author'),
    username: s.str(),
    avatar_url: s.nullable(s.str()),
    like_count: s.int('All reactions together'),
    liked_by_me: s.bool(),
    my_reaction: s.nullable(s.enum(['like', 'love', 'haha', 'wow', 'sad', 'angry'])),
    reaction_counts: s.object({}, { description: 'Reaction -> count, only for reactions someone used' }),
    media: s.array(MEDIA_ITEM, 'Photos in order (empty when none)'),
    poll: s.nullable(s.ref('Poll')),
    page: s.nullable(s.object({ id: s.id(), name: s.str() }, { description: 'Set when the post was published as a page' })),
    bookmarked_by_me: s.bool(),
    comment_count: s.int('Day 85: the comments (and replies) you would see when you open them'),
    is_share: s.bool('Days 93-94: this post shares another one'),
    shared_post: s.nullable(s.object({
      id: s.id(), content: s.nullable(s.str()), created_at: s.time(), user_id: s.id('Its author'), username: s.str(), avatar_url: s.nullable(s.str()),
      page: s.nullable(s.object({ id: s.id(), name: s.str() })), media: s.array(MEDIA_ITEM)
    }, { description: 'The shared post, while you may see it: open to everyone (or yours), no block, its author active' })),
    share_count: s.int('How many posts share this one'),
    can_share: s.bool('Share is offered: the post (a share: its original) is open to everyone')
  }, {
    optional: ['visibility', 'image_url', 'avatar_url', 'like_count', 'liked_by_me', 'my_reaction', 'reaction_counts', 'media', 'poll', 'page', 'bookmarked_by_me', 'comment_count',
      'is_share', 'shared_post', 'share_count', 'can_share'],
    description: 'A post card. Lists may add fields of their own (e.g. a group or an edit time).'
  }),
  PostRow: s.object({
    id: s.id(), user_id: s.id(), content: s.nullable(s.str()), created_at: s.time(),
    visibility: s.enum(['public', 'followers', 'close_friends', 'only_me']),
    community_id: s.nullable(s.id('The group it was posted in')),
    page_id: s.nullable(s.id('The page it was published as')),
    media: s.array(MEDIA_ITEM),
    poll: s.nullable(s.ref('Poll')),
    shared_post_id: s.nullable(s.id('Days 93-94: the post this one shares (null once it is deleted)')),
    is_share: s.bool()
  }, { optional: ['community_id', 'page_id', 'media', 'poll', 'shared_post_id', 'is_share'], description: 'A post as stored (no author name), as returned right after a write' }),
  ReactionSummary: s.object({
    likeCount: s.int('All reactions together'),
    reactionCounts: s.object({}, { description: 'Reaction -> count' })
  }),
  Comment: s.object({
    id: s.id(), content: s.str(), created_at: s.time(),
    parent_comment_id: s.nullable(s.id('Set on a reply')),
    user_id: s.id(), username: s.str(),
    like_count: s.int(), liked_by_me: s.bool(),
    awaiting_approval: s.nullable(s.bool('Only shown to the post owner: a restricted person\'s comment waiting for approval'))
  }),
  CommentRow: s.object({
    id: s.id(), post_id: s.id(), user_id: s.id(), content: s.str(), created_at: s.time(),
    parent_comment_id: s.nullable(s.id())
  }, { description: 'A comment as stored' }),
  Draft: s.object({
    id: s.id(),
    content: s.str(),
    visibility: s.enum(['public', 'followers', 'close_friends', 'only_me']),
    community_id: s.nullable(s.id()), page_id: s.nullable(s.id()),
    community_name: s.nullable(s.str()), page_name: s.nullable(s.str()),
    poll: s.nullable(s.object({ options: s.array(s.str()), durationHours: s.int() }, { description: 'As POST /posts takes it' })),
    media: s.array(MEDIA_ITEM, 'Photos already uploaded'),
    scheduled_for: s.nullable(s.time('When it will be published; null for a plain draft')),
    last_error: s.nullable(s.str('Why a scheduled post could not go up')),
    created_at: s.time(), updated_at: s.time()
  }),
  Collection: s.object({
    id: s.id(), name: s.str(), created_at: s.time(), updated_at: s.time(),
    post_count: s.int('Saved posts in it that you may still see'),
    cover_url: s.nullable(s.str('A photo from its newest post'))
  }, { optional: ['post_count', 'cover_url'] }),
  Story: s.object({
    id: s.id(), media_url: s.str(), created_at: s.time(), expires_at: s.time('24 hours after it was posted'),
    close_friends: s.bool('Only your close friends see it'), seen: s.bool()
  }, { optional: ['seen'] }),
  StoryGroup: s.object({
    user_id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()),
    is_own: s.bool(), all_seen: s.bool(), latest_at: s.time(),
    stories: s.array(s.ref('Story'), 'Oldest first')
  }),
  Event: s.object({
    id: s.id(), name: s.str(), description: s.nullable(s.str()),
    starts_at: s.time(), ends_at: s.nullable(s.time()), location: s.nullable(s.str()),
    audience: s.enum(['public', 'followers']),
    cancelled_at: s.nullable(s.time()), created_at: s.time(), has_ended: s.bool(),
    host_id: s.id(), host_username: s.str(), host_avatar_url: s.nullable(s.str()),
    going_count: s.int(), interested_count: s.int(),
    my_response: s.nullable(s.enum(['going', 'interested'])),
    is_host: s.bool()
  }),
  // ---- Messages ----
  ConversationSummary: s.object({
    conversation_id: s.id(),
    type: s.enum(['direct', 'group']),
    other_user_id: s.nullable(s.id('The other person (direct chats); null for a group')),
    username: s.str("The other person's name, or the group's name"),
    name: s.str("The group's name (groups only)"),
    avatar_url: s.nullable(s.str()),
    member_count: s.int('Groups only'),
    last_seen: s.nullable(s.time('Direct chats: when the other person was last online')),
    is_online: s.bool('Direct chats: online right now'),
    last_message_id: s.nullable(s.id()),
    last_message: s.nullable(s.str('A preview: the text, "Voice message", "Photo: caption"... (groups: with the sender\'s name)')),
    last_message_at: s.nullable(s.time()),
    activity_at: s.time('The last message, or when the chat was created'),
    unread_count: s.int(),
    muted: s.bool(),
    pinned: s.bool('Days 97-98: you pinned it'),
    archived: s.bool('Days 97-98: you archived it')
  }, { optional: ['name', 'member_count', 'last_seen'] }),
  Message: s.object({
    id: s.id(),
    conversation_id: s.id(),
    sender_id: s.id(),
    type: s.enum(['text', 'voice', 'image']),
    content: s.nullable(s.str('The text or a photo\'s caption; null once deleted')),
    media_url: s.nullable(s.str('The voice note or photo; null once deleted')),
    duration_seconds: s.nullable(s.int('Voice notes')),
    status: s.enum(['sent', 'delivered', 'read']),
    client_temp_id: s.nullable(s.str('Echoed back so the sender can match its optimistic copy')),
    created_at: s.time(),
    edited_at: s.nullable(s.time()),
    deleted_at: s.nullable(s.time('Unsent: kept in place, without its content')),
    reply_to_message_id: s.nullable(s.id()),
    is_forwarded: s.bool(),
    reply_to: s.nullable(s.object({
      id: s.id(), sender_id: s.id(), type: s.enum(['text', 'voice', 'image']), deleted: s.bool(),
      content: s.nullable(s.str('The first characters of the original'))
    })),
    reactions: s.array(s.object({ user_id: s.id(), reaction: s.str() }), 'In the order they were added')
  }, { optional: ['reply_to', 'reactions'] }),
  GroupMember: s.object({
    id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()),
    role: s.enum(['admin', 'member']), joined_at: s.time()
  }),
  MessageReactions: s.object({
    conversationId: s.id(), messageId: s.id(),
    reactions: s.array(s.object({ user_id: s.id(), reaction: s.str() }))
  }),
  // ---- Groups and pages ----
  GroupSummary: s.object({
    id: s.id(), name: s.str(), description: s.nullable(s.str()), privacy: s.enum(['public', 'private']),
    member_count: s.int(),
    my_role: s.nullable(s.enum(['admin', 'member'])),
    my_status: s.nullable(s.enum(['member', 'pending'], 'pending: you asked to join'))
  }),
  Group: s.object({
    id: s.id(), name: s.str(), description: s.nullable(s.str()), privacy: s.enum(['public', 'private']),
    created_at: s.time(), member_count: s.int(),
    my_role: s.nullable(s.enum(['admin', 'member'])), my_status: s.nullable(s.enum(['member', 'pending'])),
    is_member: s.bool(), is_admin: s.bool(),
    can_read: s.bool('Public, or you are a member')
  }),
  Page: s.object({
    id: s.id(), name: s.str(),
    category: s.enum(['business', 'creator', 'brand', 'organization', 'community', 'other']),
    description: s.nullable(s.str()), created_at: s.time(),
    owner_id: s.id(), owner_username: s.str(),
    follower_count: s.int(), is_following: s.bool(),
    is_owner: s.bool(), is_admin: s.bool('The owner or one of its admins')
  }),

  // ---- Moderation ----
  Report: s.object({
    id: s.id(), reporter_id: s.id(),
    target_type: s.enum(['post', 'user', 'comment', 'message', 'community', 'page']),
    target_id: s.id(),
    reason: s.enum(['spam', 'harassment', 'inappropriate_content', 'hate_speech', 'misinformation', 'other']),
    details: s.nullable(s.str()),
    status: s.enum(['pending', 'reviewed']),
    created_at: s.time()
  }, { description: 'The report as stored' }),
  AdminReport: s.object({
    id: s.id(),
    target_type: s.enum(['post', 'user', 'comment', 'message', 'community', 'page']),
    target_id: s.id(),
    reason: s.str(), details: s.nullable(s.str()), status: s.enum(['pending', 'reviewed']), created_at: s.time(),
    resolution: s.nullable(s.str()), resolved_at: s.nullable(s.time()),
    reporter_id: s.nullable(s.id()), reporter_username: s.nullable(s.str()), resolved_by_username: s.nullable(s.str()),
    target_snapshot: s.nullable(s.str('What was reported, as it was then (first 1000 characters)')),
    target_owner_id: s.nullable(s.id()), target_owner_username: s.nullable(s.str()),
    pending_for_target: s.int('Waiting reports about the same thing (one decision closes them all)')
  }, { description: 'A report with what it is about (current text, owner, ban state); more fields per target type' }),
  ErrorGroup: s.object({
    fingerprint: s.str(), source: s.enum(['api', 'client', 'socket']), route: s.nullable(s.str()),
    message: s.str(), stack: s.nullable(s.str()), status: s.nullable(s.int()), count: s.int(),
    first_seen: s.time(), last_seen: s.time(), resolved_at: s.nullable(s.time()), last_username: s.nullable(s.str())
  }),
  AdminAction: s.object({
    id: s.str('A 64-bit id, sent as a string of digits', { pattern: '^[0-9]+$' }),
    admin_id: s.nullable(s.id('null once that admin\'s account is gone')), admin_username: s.str(),
    action: s.enum(['report_dismissed', 'content_removed', 'user_banned', 'user_suspended', 'user_unbanned', 'error_resolved']),
    target_type: s.enum(['post', 'comment', 'message', 'community', 'page', 'user', 'error']),
    target_id: s.str('The id of what it was about (an error group: its fingerprint)'),
    target_label: s.nullable(s.str('A name for it, kept even after it is gone (never the removed content)')),
    details: s.object({}, { description: 'Reason, report count, suspension days...' }),
    created_at: s.time()
  }),
  Poll: s.object({
    closes_at: s.time(),
    closed: s.bool(),
    total_votes: s.int(),
    my_vote: s.nullable(s.id('The option you voted for')),
    show_results: s.bool('Counts are shown once you voted, the poll closed, or it is yours'),
    options: s.array(s.object({ id: s.id(), label: s.str(), votes: s.nullable(s.int('null until show_results')) }))
  })
};

module.exports = { securitySchemes, responses, schemas };
