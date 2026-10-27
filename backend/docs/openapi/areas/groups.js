// Day 68: the API spec -- groups (communities), pages, reports, and the
// admin screen (reports, bans, errors, storage, overview, log).
const { s, ref, body, json, text, op, q, pageQuery } = require('../helpers');

const GROUP_NOT_FOUND = text('Group not found');
const BAD_GROUP = text('Invalid group ID');
const GROUP_ADMIN_ONLY = text('Only group admins can do that');
const PAGE_NOT_FOUND = text('Page not found (also when its owner is deactivated or there is a block between you)');
const BAD_PAGE = text('Invalid page ID');
// Day 101: your choice for a group's / page's new posts.
const POST_LEVEL_BODY = body({
  level: s.enum(['all', 'highlights', 'off'],
    "all: every new post; highlights (the default): a group's posts by its admins and people you follow, a page's first new post of the day; off: none")
}, { required: ['level'] });
const POST_LEVEL_SAVED = json(s.object({ level: s.enum(['all', 'highlights', 'off']) }), 'Saved');
const BAD_LEVEL = 'level must be all, highlights or off';
const GROUP_FIELDS = {
  name: s.str('Up to 100 characters'),
  description: s.str('Up to 1000 characters'),
  privacy: s.enum(['public', 'private'], 'public: anyone sees posts and joins at once; private: members only, admins approve')
};
const PAGE_FIELDS = {
  name: s.str('Up to 100 characters'),
  category: s.enum(['business', 'creator', 'brand', 'organization', 'community', 'other']),
  description: s.str('Up to 1000 characters')
};
const member = (at) => s.object({ id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()), [at]: s.time() });
const OK = json(ref('Ok'), 'Done');

module.exports = {
  // ---- Groups ----
  'POST /communities': op({
    tag: 'Groups', auth: 'user',
    summary: 'Create a group (you are its admin)',
    requestBody: body(GROUP_FIELDS, { required: ['name'] }),
    responses: { 201: json(ref('Group'), 'Created'), 400: text('A missing or too long name or description, or a bad privacy') }
  }),
  'GET /communities': op({
    tag: 'Groups', auth: 'user',
    summary: 'Your groups and groups to discover',
    description: 'Without `section`: the first page of both. With it: one page of that section.',
    query: { section: q(s.enum(['mine', 'discover'])), q: q(s.str('Filter by name')), ...pageQuery({ defaultLimit: 20, maxLimit: 50 }) },
    responses: {
      200: json({
        oneOf: [
          s.object({ mine: s.array(ref('GroupSummary')), mineHasMore: s.bool(), discover: s.array(ref('GroupSummary')), discoverHasMore: s.bool() }),
          s.object({ groups: s.array(ref('GroupSummary')), page: s.int(), hasMore: s.bool() })
        ]
      }, 'The groups'),
      400: text('section must be mine or discover')
    }
  }),
  'GET /communities/:id': op({
    tag: 'Groups', auth: 'optional',
    summary: 'A group, and your place in it',
    responses: { 200: json(ref('Group'), 'The group'), 400: BAD_GROUP, 404: GROUP_NOT_FOUND }
  }),
  'PATCH /communities/:id': op({
    tag: 'Groups', auth: 'user',
    summary: 'Edit a group (admins)',
    description: 'Making a private group public lets everyone waiting in at once.',
    requestBody: body(GROUP_FIELDS, { description: 'Only the fields you send change' }),
    responses: {
      200: json(ref('Group'), 'Saved'),
      400: text('Invalid group ID / Nothing to update / a bad field'),
      403: GROUP_ADMIN_ONLY,
      404: GROUP_NOT_FOUND
    }
  }),
  'DELETE /communities/:id': op({
    tag: 'Groups', auth: 'user',
    summary: 'Delete a group and its posts (admins)',
    responses: { 200: json(s.object({ deleted: { const: true } }), 'Deleted'), 400: BAD_GROUP, 403: GROUP_ADMIN_ONLY, 404: GROUP_NOT_FOUND }
  }),
  'GET /communities/:id/posts': op({
    tag: 'Groups', auth: 'optional',
    summary: "A group's posts, newest first",
    query: pageQuery({ defaultLimit: 10, maxLimit: 50 }),
    responses: {
      200: json(s.object({ posts: s.array(ref('Post')), currentPage: s.int(), hasMore: s.bool() }), 'One page'),
      400: BAD_GROUP,
      403: text('This group is private. Join to see its posts.'),
      404: GROUP_NOT_FOUND
    }
  }),
  'GET /communities/:id/members': op({
    tag: 'Groups', auth: 'optional',
    summary: "A group's members, admins first",
    query: pageQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: {
      200: json(s.object({
        members: s.array(s.object({ id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()), role: s.enum(['admin', 'member']), joined_at: s.time() })),
        page: s.int(), hasMore: s.bool()
      }), 'One page'),
      400: BAD_GROUP,
      403: text('Join this group to see its members'),
      404: GROUP_NOT_FOUND
    }
  }),
  'PUT /communities/:id/notifications': op({
    tag: 'Groups', auth: 'user',
    summary: "Choose which of the group's new posts you hear about",
    description: 'Day 101. Members only; leaving drops the choice. The Groups switch in notification settings still turns all of them off.',
    requestBody: POST_LEVEL_BODY,
    responses: { 200: POST_LEVEL_SAVED, 400: text(`Invalid group ID / ${BAD_LEVEL}`), 403: text('Join this group first'), 404: GROUP_NOT_FOUND }
  }),
  'POST /communities/:id/join': op({
    tag: 'Groups', auth: 'user',
    summary: 'Join a public group, or ask to join a private one',
    description: "A request notifies the group's admins.",
    responses: {
      201: json(ref('Group'), 'Joined or requested (my_status says which)'),
      200: json(ref('Group'), 'Already a member, or already asked'),
      400: BAD_GROUP,
      403: text("You can't join this group (banned from it)"),
      404: GROUP_NOT_FOUND
    }
  }),
  'DELETE /communities/:id/members/:userId': op({
    tag: 'Groups', auth: 'user',
    summary: 'Remove a member (admins), decline a request (admins), or leave / cancel your request (your own id)',
    description: 'If the last admin leaves, the longest-standing member becomes admin; when the last member leaves, the group is deleted.',
    pathParams: { userId: s.id('The member; your own id to leave') },
    responses: {
      200: json(s.object({ deleted: s.bool('true: that was the last member, the group is gone') }), 'Done'),
      400: text('Invalid group or user ID'),
      403: GROUP_ADMIN_ONLY,
      404: text('Group not found / Not a member of this group')
    }
  }),
  'PUT /communities/:id/members/:userId/role': op({
    tag: 'Groups', auth: 'user',
    summary: 'Make a member an admin, or an admin a member (admins)',
    description: 'A group always keeps an admin: demoting the last one promotes the longest-standing member.',
    pathParams: { userId: s.id('The member') },
    requestBody: body({ role: s.enum(['admin', 'member']) }, { required: ['role'] }),
    responses: {
      200: OK,
      400: text('Invalid ids / role must be admin or member'),
      403: GROUP_ADMIN_ONLY,
      404: text('Group not found / Not a member of this group')
    }
  }),
  'GET /communities/:id/requests': op({
    tag: 'Groups', auth: 'user',
    summary: 'People asking to join (admins), oldest first',
    query: pageQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: {
      200: json(s.object({ requests: s.array(member('requested_at')), page: s.int(), hasMore: s.bool(), total: s.int() }), 'One page'),
      400: BAD_GROUP,
      403: GROUP_ADMIN_ONLY,
      404: GROUP_NOT_FOUND
    }
  }),
  'POST /communities/:id/requests/:userId/approve': op({
    tag: 'Groups', auth: 'user',
    summary: 'Let someone in (admins)',
    description: 'They are notified.',
    pathParams: { userId: s.id('Who asked') },
    responses: { 200: OK, 400: BAD_GROUP, 403: GROUP_ADMIN_ONLY, 404: text('Group not found / No pending request from that person') }
  }),
  'GET /communities/:id/bans': op({
    tag: 'Groups', auth: 'user',
    summary: "People banned from the group (admins)",
    query: pageQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: {
      200: json(s.object({ bans: s.array(member('banned_at')), page: s.int(), hasMore: s.bool() }), 'One page'),
      400: BAD_GROUP,
      403: GROUP_ADMIN_ONLY,
      404: GROUP_NOT_FOUND
    }
  }),
  'POST /communities/:id/bans/:userId': op({
    tag: 'Groups', auth: 'user',
    summary: 'Ban someone from the group (admins)',
    description: 'They are removed, cannot join or ask again, and their waiting request is dropped.',
    pathParams: { userId: s.id('Who to ban') },
    responses: {
      201: json(s.object({ banned: { const: true } }), 'Banned'),
      400: text("Invalid ids / You can't ban yourself / Make this admin a member before banning them"),
      403: GROUP_ADMIN_ONLY,
      404: text('Group not found / User not found')
    }
  }),
  'DELETE /communities/:id/bans/:userId': op({
    tag: 'Groups', auth: 'user',
    summary: 'Lift a ban (admins)',
    pathParams: { userId: s.id('Who to let back') },
    responses: { 200: json(s.object({ banned: { const: false } }), 'Lifted'), 400: text('Invalid ids'), 403: GROUP_ADMIN_ONLY, 404: GROUP_NOT_FOUND }
  }),

  // ---- Pages ----
  'POST /pages': op({
    tag: 'Pages', auth: 'user',
    summary: 'Create a page (you own it)',
    requestBody: body(PAGE_FIELDS, { required: ['name', 'category'] }),
    responses: { 201: json(ref('Page'), 'Created'), 400: text('A missing or too long name or description, or a bad category') }
  }),
  'GET /pages': op({
    tag: 'Pages', auth: 'user',
    summary: 'Pages you run, pages you follow, and pages to discover',
    description: 'Without `section`: the first page of each. With it: one page of that section.',
    query: { section: q(s.enum(['owned', 'following', 'discover'])), q: q(s.str('Filter by name')), ...pageQuery({ defaultLimit: 20, maxLimit: 50 }) },
    responses: {
      200: json({
        oneOf: [
          s.object({
            owned: s.array(ref('Page')), ownedHasMore: s.bool(),
            following: s.array(ref('Page')), followingHasMore: s.bool(),
            discover: s.array(ref('Page')), discoverHasMore: s.bool()
          }),
          s.object({ pages: s.array(ref('Page')), page: s.int(), hasMore: s.bool() })
        ]
      }, 'The pages'),
      400: text('section must be owned, following or discover')
    }
  }),
  'GET /pages/:id': op({
    tag: 'Pages', auth: 'optional',
    summary: 'A page',
    responses: { 200: json(ref('Page'), 'The page'), 400: BAD_PAGE, 404: PAGE_NOT_FOUND }
  }),
  'PATCH /pages/:id': op({
    tag: 'Pages', auth: 'user',
    summary: "Edit a page (its owner or admins)",
    requestBody: body(PAGE_FIELDS, { description: 'Only the fields you send change' }),
    responses: {
      200: json(ref('Page'), 'Saved'),
      400: text('Invalid page ID / Nothing to update / a bad field'),
      403: text("Only the page's owner and admins can do that"),
      404: PAGE_NOT_FOUND
    }
  }),
  'DELETE /pages/:id': op({
    tag: 'Pages', auth: 'user',
    summary: 'Delete a page and its posts (its owner)',
    responses: { 200: json(s.object({ deleted: { const: true } }), 'Deleted'), 400: BAD_PAGE, 403: text('Only the page owner can do that'), 404: PAGE_NOT_FOUND }
  }),
  'GET /pages/:id/posts': op({
    tag: 'Pages', auth: 'optional',
    summary: "A page's posts, newest first",
    query: pageQuery({ defaultLimit: 10, maxLimit: 50 }),
    responses: {
      200: json(s.object({ posts: s.array(ref('Post')), currentPage: s.int(), hasMore: s.bool() }), 'One page'),
      400: BAD_PAGE,
      404: PAGE_NOT_FOUND
    }
  }),
  'PUT /pages/:id/notifications': op({
    tag: 'Pages', auth: 'user',
    summary: "Choose which of the page's new posts you hear about",
    description: 'Day 101. Followers only; unfollowing drops the choice. The Pages switch in notification settings still turns all of them off.',
    requestBody: POST_LEVEL_BODY,
    responses: { 200: POST_LEVEL_SAVED, 400: text(`Invalid page ID / ${BAD_LEVEL}`), 403: text('Follow this page first'), 404: PAGE_NOT_FOUND }
  }),
  'POST /pages/:id/follow': op({
    tag: 'Pages', auth: 'user',
    summary: 'Follow a page (its posts come to your Home)',
    responses: { 200: json(ref('Page'), 'Following'), 400: text("Invalid page ID / You can't follow your own page"), 404: PAGE_NOT_FOUND }
  }),
  'DELETE /pages/:id/follow': op({
    tag: 'Pages', auth: 'user',
    summary: 'Unfollow a page',
    responses: {
      200: json({ oneOf: [ref('Page'), s.object({ id: s.id(), is_following: { const: false } }, { extra: false })] }, 'Done (just the id when you may no longer see the page)'),
      400: BAD_PAGE
    }
  }),
  'GET /pages/:id/admins': op({
    tag: 'Pages', auth: 'user',
    summary: "Who runs a page (its owner or admins)",
    responses: {
      200: json(s.object({ owner: ref('UserCard'), admins: s.array(member('added_at')) }), 'The owner and admins'),
      400: BAD_PAGE,
      403: text("Only the page's owner and admins can do that"),
      404: PAGE_NOT_FOUND
    }
  }),
  'POST /pages/:id/admins': op({
    tag: 'Pages', auth: 'user',
    summary: 'Make someone an admin of your page (its owner; up to 20)',
    description: 'They are notified.',
    requestBody: body({ username: s.str('With or without @') }, { required: ['username'] }),
    responses: {
      201: json(ref('UserCard'), 'Added'),
      400: text('Enter a username / The owner already runs this page / A page can have at most 20 admins'),
      403: text('Only the page owner can do that'),
      404: text('Page not found / No one with that username')
    }
  }),
  'DELETE /pages/:id/admins/:userId': op({
    tag: 'Pages', auth: 'user',
    summary: 'Remove an admin (its owner), or stop being one (your own id)',
    pathParams: { userId: s.id('The admin; your own id to step down') },
    responses: { 200: json(s.object({ removed: { const: true } }), 'Removed'), 400: text('Invalid ids'), 403: text("Only the page owner can do that (or you don't run this page)"), 404: PAGE_NOT_FOUND }
  }),

  // ---- Reports ----
  'POST /reports': op({
    tag: 'Moderation', auth: 'user', limited: true,
    summary: 'Report a post, comment, message, person, group or page',
    description: 'What was reported is kept as it was (a snapshot) for the admins, even if it is edited later.',
    requestBody: body({
      targetType: s.enum(['post', 'user', 'comment', 'message', 'community', 'page']),
      targetId: s.id(),
      reason: s.enum(['spam', 'harassment', 'inappropriate_content', 'hate_speech', 'misinformation', 'other']),
      details: s.str('Up to 500 characters')
    }, { required: ['targetType', 'targetId', 'reason'] }),
    responses: {
      201: json(ref('Report'), 'Reported'),
      400: text('A bad target type, reason or id, or something of your own'),
      404: text('It does not exist, or you may not see it')
    }
  }),

  // ---- Admin ----
  'GET /admin/reports': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Reports: waiting (oldest first) or reviewed (newest first), 20 a page',
    query: { status: q(s.enum(['pending', 'reviewed'], 'Default pending')), page: q(s.int('From 1', { default: 1 })) },
    responses: { 200: json(s.object({ reports: s.array(ref('AdminReport')), hasMore: s.bool(), page: s.int() }), 'One page') }
  }),
  'POST /admin/reports/:id/dismiss': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Dismiss a report (and every waiting report about the same thing)',
    responses: { 200: OK, 404: text('Report not found') }
  }),
  'POST /admin/reports/bulk': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Dismiss several reports, or remove what they are about',
    description: 'Day 103. One by one, exactly as the single actions (each its own decision and admin-log entry, marked bulk). '
      + 'A report already handled meanwhile is skipped (acting on one closes every waiting report on the same thing); one '
      + 'that cannot be acted on (removing an account) fails alone and the rest go on.',
    requestBody: body({
      action: s.enum(['dismiss', 'remove']),
      reportIds: s.array(s.id(), '1 to 50 report IDs (a repeated one counts once)')
    }, { required: ['action', 'reportIds'] }),
    responses: {
      200: json(s.object({
        done: s.array(s.id()),
        skipped: s.array(s.id(), 'Already handled'),
        failed: s.array(s.object({ id: s.id(), error: s.str() }))
      }), 'What happened to each'),
      400: text('action must be dismiss or remove / reportIds must be 1 to 50 report IDs')
    }
  }),
  'POST /admin/reports/:id/remove-content': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Remove what was reported (a post, comment, message, group or page) and close its reports',
    description: 'Its files are deleted after the decision is saved; the decision goes in the admin log.',
    responses: {
      200: OK,
      400: text('Accounts cannot be removed here; ban or suspend the user instead'),
      404: text('Report not found')
    }
  }),
  'POST /admin/users/:id/ban': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Ban an account (signed out everywhere, hidden, cannot log in)',
    requestBody: body({ reason: s.str('Shown in the admin log') }, { optional: true }),
    responses: {
      200: OK,
      400: text("Invalid user ID / You can't ban yourself / Admins can't be banned here"),
      404: text('User not found')
    }
  }),
  'POST /admin/users/:id/suspend': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Suspend an account for 1, 3, 7 or 30 days',
    requestBody: body({ days: s.int('1, 3, 7 or 30', { enum: [1, 3, 7, 30] }), reason: s.str() }, { required: ['days'] }),
    responses: {
      200: OK,
      400: text("days must be one of: 1, 3, 7, 30 / Invalid user ID / You can't ban yourself / Admins can't be banned here"),
      404: text('User not found')
    }
  }),
  'POST /admin/users/:id/unban': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Lift a ban or suspension',
    responses: { 200: OK, 400: text('Invalid user ID'), 404: text('That user is not banned') }
  }),
  'GET /admin/errors': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Server and browser errors, grouped, most recent first',
    query: { status: q(s.enum(['open', 'resolved'], 'Default open')), ...pageQuery({ defaultLimit: 50, maxLimit: 100 }) },
    responses: { 200: json(s.object({ page: s.int(), limit: s.int(), hasMore: s.bool(), errors: s.array(ref('ErrorGroup')) }), 'One page') }
  }),
  'POST /admin/errors/:fingerprint/resolve': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Mark an error group resolved (it reopens if it happens again)',
    pathParams: { fingerprint: s.str("The error group's fingerprint") },
    responses: { 200: OK, 404: text('Error not found') }
  }),
  'GET /admin/storage': op({
    tag: 'Admin', auth: 'admin',
    summary: 'How full the database and file storage are, and recent uploads',
    responses: {
      200: json(s.object({
        database: s.object({}), cloudinary: s.object({}), uploads: s.object({}),
        warnings: s.array(s.object({ source: s.enum(['database', 'cloudinary']), level: s.enum(['warn', 'alert']) })),
        warnAt: s.int('Percent: warn'), alertAt: s.int('Percent: alert')
      }), 'The storage report')
    }
  }),
  'GET /admin/overview': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Totals and daily counts (signups, posts, comments, reports)',
    description: 'Days are UTC; today is counted live. Big tables use Postgres\' own estimate (`estimated: true`).',
    query: { days: q(s.int('7, 30 or 90', { enum: [7, 30, 90], default: 30 })) },
    responses: {
      200: json(s.object({
        days: s.int(),
        series: s.array(s.object({ day: s.str('YYYY-MM-DD'), signups: s.int(), posts: s.int(), comments: s.int(), reports: s.int() }), 'Oldest first; the last is today'),
        totals: s.object({
          users: s.object({ count: s.int(), estimated: s.bool() }),
          posts: s.object({ count: s.int(), estimated: s.bool() }),
          comments: s.object({ count: s.int(), estimated: s.bool() }),
          groups: s.int(), pages: s.int(), pendingReports: s.int(), openErrors: s.int()
        }),
        storage: s.object({
          database: s.object({ percent: s.nullable({ type: 'number' }), level: s.str() }),
          cloudinary: s.object({ percent: s.nullable({ type: 'number' }), level: s.str() })
        })
      }), 'The overview'),
      400: text('days must be one of: 7, 30, 90')
    }
  }),
  'GET /admin/search': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Search posts and comments by their text, or accounts by username or exact email',
    description: 'Days 103-104. Unlike the app\u2019s search it sees everything (any audience, private groups, banned and deactivated '
      + 'accounts), so each search (its first page) is written to the admin log with what was searched for. Newest first, 20 a page.',
    query: {
      q: q(s.str('2 to 100 characters'), true),
      type: q(s.enum(['posts', 'comments', 'users'], 'Default posts')),
      page: q(s.int('1 to 50', { default: 1 }))
    },
    responses: {
      200: json(s.object({
        type: s.enum(['posts', 'comments', 'users']),
        results: s.array({
          oneOf: [
            s.object({
              id: s.id(), content: s.str('The first 300 characters'), created_at: s.time(),
              visibility: s.enum(['public', 'followers', 'close_friends', 'only_me']),
              community_id: s.nullable(s.id()), community_name: s.nullable(s.str()), community_privacy: s.nullable(s.enum(['public', 'private'])),
              page_id: s.nullable(s.id()), page_name: s.nullable(s.str()),
              author_id: s.id(), author_username: s.str(), author_banned: s.bool()
            }, { description: 'A post' }),
            s.object({
              id: s.id(), content: s.str('The first 300 characters'), created_at: s.time(), post_id: s.id(),
              author_id: s.id(), author_username: s.str(), author_banned: s.bool()
            }, { description: 'A comment' }),
            s.object({
              id: s.id(), username: s.str(), email: s.str(), created_at: s.time(),
              is_private: s.bool(), is_deactivated: s.bool(), is_admin: s.bool(), banned: s.bool(), banned_until: s.nullable(s.time())
            }, { description: 'An account' })
          ]
        }),
        hasMore: s.bool(),
        page: s.int()
      }), 'One page'),
      400: text('Search for 2 to 100 characters. / type must be one of: posts, comments, users / page must be 1 to 50')
    }
  }),
  'GET /admin/log': op({
    tag: 'Admin', auth: 'admin',
    summary: 'Every moderation decision, newest first, 30 a page',
    query: {
      page: q(s.int('From 1', { default: 1 })),
      action: q(s.enum(['report_dismissed', 'content_removed', 'user_banned', 'user_suspended', 'user_unbanned', 'error_resolved', 'admin_search']))
    },
    responses: {
      200: json(s.object({ actions: s.array(ref('AdminAction')), hasMore: s.bool(), page: s.int() }), 'One page'),
      400: text('action must be one of the kinds')
    }
  })
};
