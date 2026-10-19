// Day 67: shared parts of the OpenAPI spec -- security schemes, the common
// error responses, and the resource schemas the area files refer to with
// ref('Name').
const { s } = require('./helpers');

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
    language: s.nullable(s.enum(['en', 'ar'], "The account's app language (null: never chosen)"))
  }),
  Suspended: s.object({ message: s.str(), until: s.time('When the suspension ends') }),
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
      'poll_ended', 'poll_ended_own']),
    post_id: s.nullable(s.id()),
    comment_id: s.nullable(s.id()),
    is_read: s.bool(),
    created_at: s.time(),
    actor_id: s.id('Who did it (you, for notifications about your own content)'),
    actor_username: s.str(),
    actor_avatar_url: s.nullable(s.str()),
    post_content: s.nullable(s.str("The post's text, unless you may no longer see it")),
    community_id: s.nullable(s.id()), community_name: s.nullable(s.str()),
    page_id: s.nullable(s.id()), page_name: s.nullable(s.str()),
    event_id: s.nullable(s.id()), event_name: s.nullable(s.str()), event_starts_at: s.nullable(s.time())
  }),
  NotificationPreferences: s.object(Object.fromEntries(
    ['likes', 'comments', 'mentions', 'follows', 'follow_accepted', 'messages', 'groups', 'pages', 'events'].map((c) => [c, s.bool()])
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
    media: s.array(s.object({ url: s.str() }), 'Photos in order (empty when none)'),
    poll: s.nullable(s.ref('Poll')),
    page: s.nullable(s.object({ id: s.id(), name: s.str() }, { description: 'Set when the post was published as a page' })),
    bookmarked_by_me: s.bool()
  }, {
    optional: ['visibility', 'image_url', 'avatar_url', 'like_count', 'liked_by_me', 'my_reaction', 'reaction_counts', 'media', 'poll', 'page', 'bookmarked_by_me'],
    description: 'A post card. Lists may add fields of their own (e.g. a group or an edit time).'
  }),
  PostRow: s.object({
    id: s.id(), user_id: s.id(), content: s.nullable(s.str()), created_at: s.time(),
    visibility: s.enum(['public', 'followers', 'close_friends', 'only_me']),
    community_id: s.nullable(s.id('The group it was posted in')),
    page_id: s.nullable(s.id('The page it was published as')),
    media: s.array(s.object({ url: s.str() })),
    poll: s.nullable(s.ref('Poll'))
  }, { optional: ['community_id', 'page_id', 'media', 'poll'], description: 'A post as stored (no author name), as returned right after a write' }),
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
    media: s.array(s.object({ url: s.str() }), 'Photos already uploaded'),
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
