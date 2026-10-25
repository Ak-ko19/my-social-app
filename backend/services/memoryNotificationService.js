// Day 84: "You have memories from 3 years ago" -- once a day, in each
// person's own morning (from 08:00 in the time zone their app reported,
// users.time_zone; UTC when it never did), when they made profile posts
// on today's date in an earlier year. Like Facebook's memories
// notification. Off switch: notification_preferences.memories.
//
// Cost: candidates come from idx_posts_month_day for yesterday, today and
// tomorrow (every zone is within 14 hours of the database's clock) plus
// Feb 29; only those are read in each person's zone. It runs at most every
// RUN_EVERY_MS per instance, and under an advisory lock, so several
// instances never send twice; "none in the last 20 hours" makes it once
// a day.
const db = require('../db');
const notificationService = require('./notificationService');
const { pushNotification } = require('./pushService');

const RUN_EVERY_MS = 10 * 60 * 1000;
const MORNING_HOUR = 8;
const LOCK_KEY = 'mysocialapp memories notify';
let lastRun = 0;

async function notifyDue({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRun < RUN_EVERY_MS) return { people: 0 };
  lastRun = now;

  const client = await db.connect();
  let rows = [];
  try {
    await client.query('BEGIN');
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok', [LOCK_KEY]);
    if (!lock.rows[0].ok) {
      await client.query('ROLLBACK');
      return { people: 0 };
    }
    const result = await client.query(`
      WITH days AS (
        SELECT current_date + d AS day FROM generate_series(-1, 1) d
      ),
      candidates AS (
        SELECT p.user_id, p.created_at FROM posts p
        WHERE p.page_id IS NULL AND p.community_id IS NULL
          AND (
            (extract(month FROM p.created_at), extract(day FROM p.created_at)) IN (SELECT extract(month FROM day), extract(day FROM day) FROM days)
            OR (extract(month FROM p.created_at) = 2 AND extract(day FROM p.created_at) = 29)
          )
      ),
      placed AS (
        SELECT c.user_id,
          (c.created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE coalesce(u.time_zone, 'UTC') AS posted,
          now() AT TIME ZONE coalesce(u.time_zone, 'UTC') AS here
        FROM candidates c
        JOIN users u ON u.id = c.user_id
        WHERE NOT u.is_deactivated AND u.banned_at IS NULL
      ),
      due AS (
        SELECT user_id, min(extract(year FROM here) - extract(year FROM posted))::int AS years_ago
        FROM placed
        WHERE extract(year FROM posted) < extract(year FROM here)
          AND extract(hour FROM here) >= ${MORNING_HOUR}
          AND (
            (extract(month FROM posted) = extract(month FROM here) AND extract(day FROM posted) = extract(day FROM here))
            -- A Feb 29 post on Feb 28 of a year without one.
            OR (extract(month FROM posted) = 2 AND extract(day FROM posted) = 29
                AND extract(month FROM here) = 2 AND extract(day FROM here) = 28
                AND extract(day FROM make_date(extract(year FROM here)::int, 3, 1) - 1) = 28)
          )
        GROUP BY user_id
      )
      INSERT INTO notifications (user_id, actor_id, type, details)
      SELECT due.user_id, due.user_id, 'memories', jsonb_build_object('yearsAgo', due.years_ago)
      FROM due
      WHERE ${notificationService.allowedSql('memories', 'due.user_id')}
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = due.user_id AND n.type = 'memories' AND n.created_at > now() - interval '20 hours'
        )
      RETURNING user_id, details
    `);
    rows = result.rows;
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  for (const row of rows) {
    pushNotification({ userId: row.user_id, actorId: row.user_id, type: 'memories' });
    notificationService.announce(row.user_id);
  }
  return { people: rows.length };
}

// Tests only.
function resetClock() {
  lastRun = 0;
}

module.exports = { notifyDue, resetClock, MORNING_HOUR };
