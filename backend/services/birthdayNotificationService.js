// Day 111: "Today is Ann's birthday" -- to Ann's friends (people who follow
// each other, Day 37), from 08:00 in each FRIEND's own time zone
// (users.time_zone; UTC when the app never reported one) on the day. Only
// when Ann shows her birthday to friends or everyone; a 29 February
// birthday is on 28 February in other years. Off switch:
// notification_preferences.birthdays. Never across a block, never from
// someone the friend restricted, never for deactivated or banned accounts.
//
// Like the memories notification (Day 84): candidates come from
// idx_users_birthday for yesterday, today and tomorrow (every zone is within
// 14 hours of the database's clock) plus 29 February; each friend's own date
// decides. At most every RUN_EVERY_MS per instance, under an advisory lock
// (several instances never send twice); "not in the last 2 days" makes it
// once per birthday.
const db = require('../db');
const notificationService = require('./notificationService');
const { pushNotification } = require('./pushService');
const { noBlockBetweenSql } = require('./blockService');
const { notRestrictedSql } = require('./restrictService');

const RUN_EVERY_MS = 10 * 60 * 1000;
const MORNING_HOUR = 8;
const LOCK_KEY = 'mysocialapp birthday notify';
let lastRun = 0;

// SQL: "a birthday on month m, day d falls on the date of `here` (a local
// timestamp)" -- 29 February on the 28th of a year without one.
const onBirthdaySql = (m, d, here) => `(
  (${m} = extract(month FROM ${here}) AND ${d} = extract(day FROM ${here}))
  OR (${m} = 2 AND ${d} = 29 AND extract(month FROM ${here}) = 2 AND extract(day FROM ${here}) = 28
      AND extract(day FROM make_date(extract(year FROM ${here})::int, 3, 1) - 1) = 28))`;

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
      celebrants AS (
        SELECT u.id, u.birthday_month AS m, u.birthday_day AS d FROM users u
        WHERE u.birthday_month IS NOT NULL
          AND u.birthday_audience IN ('friends', 'public')
          AND NOT u.is_deactivated AND u.banned_at IS NULL
          AND (
            (u.birthday_month, u.birthday_day) IN (SELECT extract(month FROM day)::int, extract(day FROM day)::int FROM days)
            OR (u.birthday_month = 2 AND u.birthday_day = 29)
          )
      ),
      pairs AS (
        SELECT c.id AS celebrant, fu.id AS friend, c.m, c.d,
          now() AT TIME ZONE coalesce(fu.time_zone, 'UTC') AS here
        FROM celebrants c
        JOIN follows f1 ON f1.follower_id = c.id AND f1.status = 'accepted'
        JOIN follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = c.id AND f2.status = 'accepted'
        JOIN users fu ON fu.id = f1.following_id AND NOT fu.is_deactivated AND fu.banned_at IS NULL
      ),
      due AS (
        SELECT celebrant, friend FROM pairs
        WHERE extract(hour FROM here) >= ${MORNING_HOUR} AND ${onBirthdaySql('m', 'd', 'here')}
      )
      INSERT INTO notifications (user_id, actor_id, type)
      SELECT due.friend, due.celebrant, 'birthday'
      FROM due
      WHERE ${notificationService.allowedSql('birthdays', 'due.friend')}
        AND ${notRestrictedSql('due.friend', 'due.celebrant')}
        AND ${noBlockBetweenSql('due.friend', 'due.celebrant')}
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = due.friend AND n.actor_id = due.celebrant AND n.type = 'birthday'
            AND n.created_at > now() - interval '2 days'
        )
      RETURNING user_id, actor_id
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
    pushNotification({ userId: row.user_id, actorId: row.actor_id, type: 'birthday' });
    notificationService.announce(row.user_id);
  }
  return { people: rows.length };
}

// Tests only.
function resetClock() {
  lastRun = 0;
}

module.exports = { notifyDue, resetClock, onBirthdaySql, MORNING_HOUR };
