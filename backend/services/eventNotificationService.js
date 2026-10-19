// Day 55 step 3: telling the people who answered an event (Going or
// Interested) -- a reminder about an hour before it starts (from the
// ticker), and when the host cancels it. Through notificationService, so
// everyone's settings ("Events") and restrictions apply.
const db = require('../db');
const { noBlockBetweenSql } = require('../services/blockService');
const notificationService = require('./notificationService');

const REMIND_BEFORE_MINUTES = 60;
const MAX_PER_RUN = 25;

// The people who answered event $1 and may still see it (the rules of
// eventController's eventVisibleSql): active, no block either way with
// the host, and a followers-only event still has them as a follower.
const RESPONDERS_WHO_CAN_SEE = `
  SELECT r.user_id
  FROM event_responses r
  JOIN events e ON e.id = r.event_id
  JOIN users who ON who.id = r.user_id
  WHERE r.event_id = $1
    AND NOT who.is_deactivated
    AND ${noBlockBetweenSql('r.user_id', 'e.host_id')}
    AND (e.audience = 'public' OR EXISTS (SELECT 1 FROM follows f
      WHERE f.follower_id = r.user_id AND f.following_id = e.host_id AND f.status = 'accepted'))
  ORDER BY r.created_at, r.user_id`;

async function notifyResponders(eventId, hostId, type) {
  const people = (await db.query(RESPONDERS_WHO_CAN_SEE, [eventId])).rows;
  for (const { user_id: userId } of people) {
    await notificationService.notify({ userId, actorId: hostId, type, eventId });
  }
  return people.length;
}

// Takes the next event that needs its reminder and marks it, in one short
// transaction (FOR UPDATE SKIP LOCKED: two runs never take the same one),
// then reminds its people -- unless it has already started (the server
// slept through the hour), when a late "starts soon" would be wrong.
// Returns how many were reminded, or null when nothing is waiting.
async function remindNext() {
  const client = await db.connect();
  let event;
  try {
    await client.query('BEGIN');
    event = (await client.query(
      `SELECT id, host_id, starts_at <= now() AS started FROM events
       WHERE reminder_sent_at IS NULL AND cancelled_at IS NULL
         AND starts_at <= now() + make_interval(mins => $1)
       ORDER BY starts_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [REMIND_BEFORE_MINUTES]
    )).rows[0];
    if (!event) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('UPDATE events SET reminder_sent_at = now() WHERE id = $1', [event.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (event.started) return 0;
  return notifyResponders(event.id, event.host_id, 'event_reminder');
}

// Every event waiting for its reminder, up to MAX_PER_RUN: { events, people }.
async function remindDue({ limit = MAX_PER_RUN } = {}) {
  const counts = { events: 0, people: 0 };
  for (let i = 0; i < limit; i += 1) {
    const people = await remindNext();
    if (people === null) break;
    counts.events += 1;
    counts.people += people;
  }
  return counts;
}

module.exports = { remindDue, notifyResponders, REMIND_BEFORE_MINUTES };
