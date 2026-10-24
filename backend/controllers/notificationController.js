const db = require('../db');
const { sendError } = require('../utils/httpError');
const notificationService = require('../services/notificationService');
const { encodeCursor, decodeCursor, getLimit } = require('../utils/cursorPagination');

// Day 81: notifications that belong together show as one row, like
// Facebook's "Alice, Bob and 3 others liked your post": likes and comments
// on the same post, likes of the same comment, and new followers on the
// same (UTC) day. Every other kind stays one row each. ($n = the row.)
const GROUP_KEY_SQL = (n) => `CASE
  WHEN ${n}.type IN ('like', 'comment') AND ${n}.post_id IS NOT NULL THEN ${n}.type || ':p' || ${n}.post_id
  WHEN ${n}.type = 'comment_like' AND ${n}.comment_id IS NOT NULL THEN ${n}.type || ':c' || ${n}.comment_id
  WHEN ${n}.type = 'follow' THEN 'follow:' || to_char(${n}.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ELSE 'n' || ${n}.id END`;

// ?filter= -- which kinds a tab shows. Type names only come from here.
const FILTER_TYPES = {
  mentions: ['mention', 'reply', 'comment'],
  follows: ['follow', 'follow_request', 'follow_accepted']
};
const FILTERS = ['all', 'unread', ...Object.keys(FILTER_TYPES)];
const ACTOR_SAMPLE = 3;
// The list covers your newest 1,000 notifications (Facebook's goes back a
// similar way): grouping reads only those, through the (user_id,
// created_at) index, however many a busy account has.
const WINDOW = 1000;

// GET /notifications?filter=&cursor=&limit= -- newest group first, by its
// newest notification; the cursor is that notification's id. A group is
// read only when all of it is. Bounded by WINDOW (and the 90 days
// notifications are kept, cleanupService).
async function getNotifications(req, res) {
  try {
    const filter = req.query.filter === undefined ? 'all' : String(req.query.filter);
    if (!FILTERS.includes(filter)) return res.status(400).send(`filter must be one of: ${FILTERS.join(', ')}`);
    let cursor = null;
    try {
      cursor = decodeCursor(req.query.cursor === undefined ? null : String(req.query.cursor));
    } catch {
      return res.status(400).send('Invalid cursor');
    }
    const limit = getLimit(req, { defaultLimit: 20, maxLimit: 50 });

    const result = await db.query(`
      WITH mine AS (
        SELECT n.id, n.actor_id, n.is_read, n.created_at, ${GROUP_KEY_SQL('n')} AS group_key
        FROM notifications n
        WHERE n.user_id = $1 AND ($4::text[] IS NULL OR n.type = ANY($4::text[]))
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ${WINDOW}
      ),
      groups AS (
        SELECT group_key, max(id) AS id, count(*)::int AS count, count(DISTINCT actor_id)::int AS actor_count,
               bool_and(is_read) AS is_read
        FROM mine
        GROUP BY group_key
        HAVING ($5::boolean IS NOT TRUE OR NOT bool_and(is_read))
      ),
      page AS (
        SELECT * FROM groups WHERE ($2::int IS NULL OR id < $2::int) ORDER BY id DESC LIMIT $3::int + 1
      )
      SELECT
        notifications.id, notifications.type, notifications.post_id, notifications.comment_id,
        page.is_read, notifications.created_at, page.count, page.actor_count,
        actor.id AS actor_id, actor.username AS actor_username, actor.avatar_url AS actor_avatar_url,
        -- The newest few people in the group (one row each), newest first.
        (SELECT coalesce(json_agg(json_build_object('id', a.id, 'username', a.username, 'avatar_url', a.avatar_url) ORDER BY newest.id DESC), '[]')
           FROM (SELECT per_actor.actor_id, per_actor.id
                 FROM (SELECT DISTINCT ON (m.actor_id) m.actor_id, m.id FROM mine m
                       WHERE m.group_key = page.group_key ORDER BY m.actor_id, m.id DESC) per_actor
                 ORDER BY per_actor.id DESC LIMIT ${ACTOR_SAMPLE}) newest
           JOIN users a ON a.id = newest.actor_id) AS actors,
        -- Day 20: no snippet of a post that has since become "only me"
        -- (unless it's your own).
        CASE WHEN posts.user_id = $1 OR posts.visibility IN ('public', 'followers')
          -- Day 47: a close-friends post only for people on the list.
          OR (posts.visibility = 'close_friends' AND EXISTS (SELECT 1 FROM close_friends cf WHERE cf.user_id = posts.user_id AND cf.friend_id = $1))
          THEN posts.content END AS post_content,
        -- Day 50: group notifications name the group.
        notifications.community_id, communities.name AS community_name,
        -- Day 53: and page notifications name the page.
        notifications.page_id, pages.name AS page_name,
        -- Day 55: and event notifications name the event; the app shows its
        -- start in the viewer's own time zone.
        notifications.event_id, events.name AS event_name, events.starts_at AS event_starts_at,
        -- Day 77: a "new login" alert names the device ({ browser, os, kind }).
        notifications.device,
        -- Day 82: removed content -- { kind, reason, excerpt }.
        notifications.details
      FROM page
      JOIN notifications ON notifications.id = page.id
      JOIN users actor ON notifications.actor_id = actor.id
      LEFT JOIN posts ON notifications.post_id = posts.id
      LEFT JOIN communities ON notifications.community_id = communities.id
      LEFT JOIN pages ON notifications.page_id = pages.id
      LEFT JOIN events ON notifications.event_id = events.id
      ORDER BY page.id DESC
    `, [req.userId, cursor?.id ?? null, limit, FILTER_TYPES[filter] || null, filter === 'unread']);

    const rows = result.rows.slice(0, limit);
    const nextCursor = result.rows.length > limit ? encodeCursor({ id: rows[rows.length - 1].id }) : null;
    res.status(200).json({ notifications: rows, nextCursor });
  } catch (err) {
    sendError(res, err, 'Fetch notifications failed. Please try again later.');
  }
}

async function getUnreadCount(req, res) {
  try {
    const result = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.userId]
    );
    res.status(200).json({ unreadCount: parseInt(result.rows[0].count) });
  } catch (err) {
    sendError(res, err, 'Fetch unread count failed. Please try again later.');
  }
}

// Day 81: marks the notification's whole group read (a grouped row is one
// notification on screen). -> { id, is_read: true, marked: how many }
async function markAsRead(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid notification ID');
    }
    const own = await db.query('SELECT id FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (own.rows.length === 0) {
      return res.status(404).send('Notification not found');
    }
    const result = await db.query(
      `UPDATE notifications SET is_read = true
       WHERE user_id = $2 AND is_read = false
         AND ${GROUP_KEY_SQL('notifications')} = (SELECT ${GROUP_KEY_SQL('t')} FROM notifications t WHERE t.id = $1)`,
      [req.params.id, req.userId]
    );
    if (result.rowCount > 0) notificationService.announce(req.userId, { read: true });
    res.status(200).json({ id: own.rows[0].id, is_read: true, marked: result.rowCount });
  } catch (err) {
    sendError(res, err, 'Mark as read failed. Please try again later.');
  }
}

async function markAllAsRead(req, res) {
  try {
    await db.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.userId]
    );
    notificationService.announce(req.userId, { read: true });
    res.status(200).send('All notifications marked as read');
  } catch (err) {
    sendError(res, err, 'Mark all as read failed. Please try again later.');
  }
}

// B11: GET /notification-preferences -- the five category switches.
async function getPreferences(req, res) {
  try {
    res.json(await notificationService.getPreferences(req.userId));
  } catch (err) {
    sendError(res, err, 'Loading notification settings failed. Please try again later.');
  }
}

// B11: PUT /notification-preferences -- partial; only boolean values for
// known categories are applied, anything else is a 400.
async function updatePreferences(req, res) {
  try {
    const body = req.body || {};
    const keys = Object.keys(body);
    const unknown = keys.filter((k) => !notificationService.CATEGORIES.includes(k));
    if (keys.length === 0 || unknown.length > 0 || keys.some((k) => typeof body[k] !== 'boolean')) {
      return res.status(400).send(`Send true/false for any of: ${notificationService.CATEGORIES.join(', ')}`);
    }
    res.json(await notificationService.updatePreferences(req.userId, body));
  } catch (err) {
    sendError(res, err, 'Saving notification settings failed. Please try again later.');
  }
}

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead,
  getPreferences,
  updatePreferences
};
