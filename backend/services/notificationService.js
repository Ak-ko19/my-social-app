// B11: the ONE place notifications get created, so every type respects the
// recipient's notification settings (migration 024) and a new type can't
// forget to. Missing preferences row = everything on.
const db = require('../db');
const { pushNotification } = require('./pushService');

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
  follow_accepted: 'follow_accepted'
};

// 'messages' (Day 23) has no notification type: it controls message pushes
// (pushService.pushNewMessage).
const CATEGORIES = ['likes', 'comments', 'mentions', 'follows', 'follow_accepted', 'messages'];

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

// Creates one notification unless the recipient turned that category off
// (or is the actor -- nobody is notified about their own actions). The
// preference check and the insert are one statement.
async function notify({ userId, actorId, type, postId = null, commentId = null }) {
  if (userId === actorId) return;
  const category = categoryFor(type);
  const result = await db.query(
    `INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id)
     SELECT $1, $2, $3, $4, $5
     WHERE ${allowedSql(category, '$1::int')}
     RETURNING id`,
    [userId, actorId, type, postId, commentId]
  );
  // Day 22: a push to their devices too -- only when the notification was
  // actually created (so the same settings apply).
  if (result.rowCount > 0) pushNotification({ userId, actorId, type, postId, commentId });
}

// Day 45: notifications about your OWN content that nobody else caused --
// a scheduled post went up, or couldn't. The actor is you; they have no
// setting (like Facebook's), since they tell you what happened to
// something you made.
const SYSTEM_TYPES = ['scheduled_post', 'scheduled_failed'];

async function notifySystem({ userId, type, postId = null }) {
  if (!SYSTEM_TYPES.includes(type)) throw new Error(`Unknown system notification type: ${type}`);
  await db.query(
    'INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES ($1, $1, $2, $3)',
    [userId, type, postId]
  );
  pushNotification({ userId, actorId: userId, type, postId });
}

// { likes, comments, mentions, follows, follow_accepted, messages } -- all true when
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

module.exports = { notify, notifySystem, SYSTEM_TYPES, getPreferences, updatePreferences, allowedSql, CATEGORIES, CATEGORY_BY_TYPE };
