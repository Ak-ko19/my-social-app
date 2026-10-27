// B11: the ONE place notifications get created, so every type respects the
// recipient's notification settings (migration 024) and a new type can't
// forget to. Missing preferences row = everything on.
const db = require('../db');
const { pushNotification } = require('./pushService');
const { notRestrictedSql } = require('./restrictService');
const { noBlockBetweenSql } = require('./blockService');
const { notMutedSql } = require('./muteService');
const logger = require('../utils/logger');

// Day 91 (AUDIT_REPORT_4 B1): which of a person's notifications they see --
// their own system ones (the actor is them) and any whose actor has no
// block with them, in either direction. Blocking hides the rows, counts
// and faces; it doesn't delete them, so an unblock brings them back (like
// Facebook). n = the notifications row's alias.
// Day 101: and a group's new posts only while you are still a member (no
// snippet of a private group's post after you leave; joining again brings
// them back).
function visibleSql(n) {
  return `((${n}.actor_id = ${n}.user_id OR ${noBlockBetweenSql(`${n}.user_id`, `${n}.actor_id`)})
    AND (${n}.type <> 'group_post' OR EXISTS (
      SELECT 1 FROM community_members vm WHERE vm.community_id = ${n}.community_id AND vm.user_id = ${n}.user_id AND vm.status = 'member')))`;
}

// Day 81: tells the user's open apps at once, with the new unread count:
// 'notification_new' (the badge and an open Notifications screen update
// without a reload) or 'notifications_read' (another tab read some). Best
// effort: no socket server (API tests, scripts) or a failed count just
// means no live update.
async function announce(userId, { read = false } = {}) {
  try {
    // Lazy: sockets/ requires services that require this module.
    const { getIO } = require('../sockets');
    let io;
    try {
      io = getIO();
    } catch {
      return;
    }
    const unread = await db.query(`SELECT count(*)::int AS n FROM notifications n WHERE n.user_id = $1 AND n.is_read = false AND ${visibleSql('n')}`, [userId]);
    const payload = { unreadCount: unread.rows[0].n };
    if (read) io.to(`user_${userId}`).emit('notifications_read', payload);
    else io.to(`user_${userId}`).emit('notification_new', payload);
  } catch (err) {
    logger.error('notification announce failed', { userId, err });
  }
}

// Notification type -> the setting (column) that controls it. Column names
// come only from this map, never from input, so interpolating them into
// SQL below is safe.
const CATEGORY_BY_TYPE = {
  like: 'likes',
  comment_like: 'likes',
  comment: 'comments',
  reply: 'comments',
  mention: 'mentions',
  follow: 'follows',
  follow_request: 'follows',
  follow_accepted: 'follow_accepted',
  // Day 50: groups -- a request to join (to its admins), let in (to them).
  group_request: 'groups',
  group_approved: 'groups',
  // Day 53: someone made you an admin of their page.
  page_admin: 'pages',
  // Day 55: an event you answered starts within the hour, or was cancelled.
  event_reminder: 'events',
  event_cancelled: 'events',
  // Days 93-94: someone shared your post to their feed.
  share: 'shares',
  // Day 101: a new post in your group / on a page you follow (notifyNewPost).
  group_post: 'groups',
  page_post: 'pages'
};

// 'messages' (Day 23) has no notification type: it controls message pushes
// (pushService.pushNewMessage).
// Day 84: 'memories' has no actor type either: it controls the morning
// memories notification (memoryNotificationService).
const CATEGORIES = ['likes', 'comments', 'mentions', 'follows', 'follow_accepted', 'messages', 'groups', 'pages', 'events', 'memories', 'shares'];

function categoryFor(type) {
  const category = CATEGORY_BY_TYPE[type];
  if (!category) throw new Error(`Unknown notification type: ${type}`);
  return category;
}

// SQL condition "recipient <recipientSql> hasn't turned <category> off".
function allowedSql(category, recipientSql) {
  return `NOT EXISTS (
    SELECT 1 FROM notification_preferences np
    WHERE np.user_id = ${recipientSql} AND np.${category} = false
  )`;
}

// Day 91 (AUDIT_REPORT_4 B2): kinds someone can repeat by undoing and
// redoing (like -> unlike -> like, follow -> unfollow -> follow). Each
// would otherwise be a new notification AND a new push every time. A like
// is news once (for as long as the notification is kept); a follow again
// after a day is news again. Intervals come only from this map.
const REPEAT_WINDOW = {
  like: null,
  comment_like: null,
  follow: '1 day',
  follow_request: '1 day',
  // Days 93-94: sharing the same post again isn't news either.
  share: null
};

// SQL condition "this actor hasn't already told this person this", for a
// repeatable type ($1 user, $2 actor, $4 post, $5 comment). The type is one of
// REPEAT_WINDOW's own keys, never input, so it is written in as a literal.
function notRepeatSql(type) {
  if (!Object.hasOwn(REPEAT_WINDOW, type)) return 'true';
  const window = REPEAT_WINDOW[type];
  return `NOT EXISTS (
    SELECT 1 FROM notifications d
    WHERE d.user_id = $1 AND d.type = '${type}' AND d.actor_id = $2
      AND d.post_id IS NOT DISTINCT FROM $4::int AND d.comment_id IS NOT DISTINCT FROM $5::int
      ${window ? `AND d.created_at > now() - interval '${window}'` : ''}
  )`;
}

// Creates one notification unless the recipient turned that category off
// (or is the actor -- nobody is notified about their own actions). The
// preference check and the insert are one statement.
async function notify({ userId, actorId, type, postId = null, commentId = null, communityId = null, pageId = null, eventId = null }) {
  if (userId === actorId) return;
  const category = categoryFor(type);
  const result = await db.query(
    `INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id, community_id, page_id, event_id)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
     WHERE ${allowedSql(category, '$1::int')}
       -- Day 47: nobody you restricted can notify you.
       AND ${notRestrictedSql('$1::int', '$2::int')}
       -- Day 91: nor anyone with a block between you (B1), nor the same
       -- thing twice (B2).
       AND ${noBlockBetweenSql('$1::int', '$2::int')}
       AND ${notRepeatSql(type)}
     RETURNING id`,
    [userId, actorId, type, postId, commentId, communityId, pageId, eventId]
  );
  // Day 22: a push to their devices too -- only when the notification was
  // actually created (so the same settings apply).
  if (result.rowCount > 0) {
    pushNotification({ userId, actorId, type, postId, commentId, communityId, pageId, eventId });
    announce(userId);
  }
}

// Day 45: notifications about your OWN content that nobody else caused --
// a scheduled post went up, or couldn't. The actor is you; they have no
// setting (like Facebook's), since they tell you what happened to
// something you made.
// Day 77: 'new_login' -- a login on a kind of device the account hasn't
// used lately (services/loginAlertService.js); `device` is { browser, os,
// kind }. Security alerts have no off switch in the settings.
// Day 82: 'content_removed' -- an admin removed something of yours after a
// report (adminController); `details` is { kind, reason, excerpt }, since
// the thing itself is gone. No off switch either: you should know.
const SYSTEM_TYPES = ['scheduled_post', 'scheduled_failed', 'new_login', 'content_removed'];

async function notifySystem({ userId, type, postId = null, device = null, details = null }) {
  if (!SYSTEM_TYPES.includes(type)) throw new Error(`Unknown system notification type: ${type}`);
  await db.query(
    'INSERT INTO notifications (user_id, actor_id, type, post_id, device, details) VALUES ($1, $1, $2, $3, $4, $5)',
    [userId, type, postId, device, details]
  );
  pushNotification({ userId, actorId: userId, type, postId, device, details });
  announce(userId);
}

// Day 101: what each member's / follower's choice lets through (migration
// 083). $1 the author, $3 the group / page; the alias is the membership.
const POST_LEVELS = ['all', 'highlights', 'off'];
const GROUP_HIGHLIGHT_SQL = (cm) => `(${cm}.post_notifications = 'all' OR (${cm}.post_notifications = 'highlights' AND (
  -- Highlights: the group's admins, and people you follow.
  EXISTS (SELECT 1 FROM community_members ad WHERE ad.community_id = $3 AND ad.user_id = $1 AND ad.role = 'admin' AND ad.status = 'member')
  OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ${cm}.user_id AND f.following_id = $1 AND f.status = 'accepted'))))`;
const PAGE_HIGHLIGHT_SQL = (pf) => `(${pf}.post_notifications = 'all' OR (${pf}.post_notifications = 'highlights' AND NOT EXISTS (
  -- Highlights: the page's first new post of the day.
  SELECT 1 FROM notifications d WHERE d.user_id = ${pf}.user_id AND d.type = 'page_post' AND d.page_id = $3
    AND d.created_at > now() - interval '1 day')))`;

// Day 101: "NAME posted in GROUP" to the group's members, "PAGE posted" to
// the page's followers -- one INSERT ... SELECT for everyone, each with the
// same rules as notify (their Groups / Pages setting, no block, nobody they
// restricted) plus their choice for that group / page. Never the author; a
// page's post never to its own admins (one of them wrote it); a group post
// not from someone you muted (their posts left your Home). `post` is the
// saved posts row: user_id (a page post: the page's owner), community_id,
// page_id.
async function notifyNewPost(post) {
  const common = (who) => `${allowedSql(post.community_id ? 'groups' : 'pages', who)}
    AND ${notRestrictedSql(who, '$1::int')}
    AND ${noBlockBetweenSql(who, '$1::int')}`;
  let result;
  if (post.community_id) {
    result = await db.query(
      `INSERT INTO notifications (user_id, actor_id, type, post_id, community_id)
       SELECT cm.user_id, $1, 'group_post', $2, $3
       FROM community_members cm
       WHERE cm.community_id = $3 AND cm.status = 'member' AND cm.user_id <> $1
         AND ${GROUP_HIGHLIGHT_SQL('cm')}
         AND ${notMutedSql('cm.user_id', '$1::int')}
         AND ${common('cm.user_id')}
       RETURNING user_id`,
      [post.user_id, post.id, post.community_id]
    );
  } else if (post.page_id) {
    result = await db.query(
      `INSERT INTO notifications (user_id, actor_id, type, post_id, page_id)
       SELECT pf.user_id, $1, 'page_post', $2, $3
       FROM page_follows pf
       WHERE pf.page_id = $3 AND pf.user_id <> $1
         AND NOT EXISTS (SELECT 1 FROM page_admins pa WHERE pa.page_id = $3 AND pa.user_id = pf.user_id)
         AND ${PAGE_HIGHLIGHT_SQL('pf')}
         AND ${common('pf.user_id')}
       RETURNING user_id`,
      [post.user_id, post.id, post.page_id]
    );
  } else {
    return 0;
  }
  const type = post.community_id ? 'group_post' : 'page_post';
  for (const { user_id: userId } of result.rows) {
    pushNotification({ userId, actorId: post.user_id, type, postId: post.id, communityId: post.community_id, pageId: post.page_id });
    announce(userId);
  }
  return result.rowCount;
}

// { likes, comments, mentions, follows, follow_accepted, messages, groups, pages, events, memories, shares } -- all true when
// the user never saved settings.
async function getPreferences(userId) {
  const result = await db.query(`SELECT ${CATEGORIES.join(', ')} FROM notification_preferences WHERE user_id = $1`, [userId]);
  if (result.rows.length === 0) return Object.fromEntries(CATEGORIES.map((c) => [c, true]));
  return result.rows[0];
}

// Partial update: only the categories present (as booleans) change.
async function updatePreferences(userId, changes) {
  const updates = CATEGORIES.filter((c) => typeof changes[c] === 'boolean');
  if (updates.length === 0) return getPreferences(userId);
  const current = await getPreferences(userId);
  const next = { ...current };
  for (const c of updates) next[c] = changes[c];
  await db.query(
    `INSERT INTO notification_preferences (user_id, ${CATEGORIES.join(', ')}, updated_at)
     VALUES ($1, ${CATEGORIES.map((_, i) => `$${i + 2}`).join(', ')}, now())
     ON CONFLICT (user_id) DO UPDATE SET
       ${CATEGORIES.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now()`,
    [userId, ...CATEGORIES.map((c) => next[c])]
  );
  return next;
}

module.exports = { notify, notifySystem, notifyNewPost, POST_LEVELS, announce, SYSTEM_TYPES, getPreferences, updatePreferences, allowedSql, visibleSql, CATEGORIES, CATEGORY_BY_TYPE };
