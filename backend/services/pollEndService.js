// Day 45 step 4: when a poll ends, its author and the people who voted are
// told the results are in (like X). Sent once per poll (polls.ended_notified,
// migration 053) by the server's ticker and the daily cleanup.
const db = require('../db');
const { pushNotification } = require('./pushService');

const MAX_PER_RUN = 25;
const QUEUE_SQL = 'NOT ended_notified AND closes_at <= now()';

// The voters ($1 = the post) who may still see the post -- the rules of
// postVisibilityService.getVisiblePost, as one query: the author is
// active, it isn't "only me", no block either way, and the group's /
// private account's / followers-only audience still includes them.
const VOTERS_WHO_CAN_SEE = `
  SELECT DISTINCT v.user_id
  FROM poll_votes v
  JOIN posts p ON p.id = v.post_id
  JOIN users author ON author.id = p.user_id
  LEFT JOIN communities c ON c.id = p.community_id
  WHERE v.post_id = $1
    AND v.user_id <> p.user_id
    AND NOT author.is_deactivated
    AND p.visibility <> 'only_me'
    AND (p.visibility <> 'close_friends' OR EXISTS (
      SELECT 1 FROM close_friends cf WHERE cf.user_id = p.user_id AND cf.friend_id = v.user_id))
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = v.user_id AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = v.user_id)
    )
    AND CASE
      WHEN p.community_id IS NOT NULL THEN c.privacy = 'public' OR EXISTS (
        SELECT 1 FROM community_members cm WHERE cm.community_id = p.community_id AND cm.user_id = v.user_id AND cm.status = 'member')
      WHEN p.page_id IS NOT NULL THEN true
      WHEN author.is_private OR p.visibility = 'followers' THEN EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = v.user_id AND f.following_id = p.user_id AND f.status = 'accepted')
      ELSE true
    END`;

// Takes the next ended poll nobody was told about, marks it and creates
// the notifications, in one transaction (FOR UPDATE SKIP LOCKED: two runs
// never notify the same poll). Returns how many people were notified, or
// null when nothing is waiting.
async function notifyNext() {
  const client = await db.connect();
  let notified;
  try {
    await client.query('BEGIN');
    const poll = (await client.query(
      `SELECT polls.post_id, posts.user_id AS author_id FROM polls JOIN posts ON posts.id = polls.post_id
       WHERE ${QUEUE_SQL} ORDER BY closes_at, polls.post_id LIMIT 1 FOR UPDATE OF polls SKIP LOCKED`
    )).rows[0];
    if (!poll) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('UPDATE polls SET ended_notified = true WHERE post_id = $1', [poll.post_id]);
    await client.query(
      "INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES ($1, $1, 'poll_ended_own', $2)",
      [poll.author_id, poll.post_id]
    );
    const voters = await client.query(
      `INSERT INTO notifications (user_id, actor_id, type, post_id)
       SELECT seen.user_id, $2, 'poll_ended', $1 FROM (${VOTERS_WHO_CAN_SEE}) seen
       RETURNING user_id`,
      [poll.post_id, poll.author_id]
    );
    await client.query('COMMIT');
    notified = { poll, voterIds: voters.rows.map((r) => r.user_id) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const { poll, voterIds } = notified;
  pushNotification({ userId: poll.author_id, actorId: poll.author_id, type: 'poll_ended_own', postId: poll.post_id });
  for (const userId of voterIds) pushNotification({ userId, actorId: poll.author_id, type: 'poll_ended', postId: poll.post_id });
  return 1 + voterIds.length;
}

// Every ended poll waiting, up to MAX_PER_RUN. { polls, people }.
async function notifyEnded({ limit = MAX_PER_RUN } = {}) {
  const counts = { polls: 0, people: 0 };
  for (let i = 0; i < limit; i += 1) {
    const people = await notifyNext();
    if (people === null) break;
    counts.polls += 1;
    counts.people += people;
  }
  return counts;
}

async function countWaiting() {
  return (await db.query(`SELECT COUNT(*)::int AS n FROM polls WHERE ${QUEUE_SQL}`)).rows[0].n;
}

module.exports = { notifyEnded, notifyNext, countWaiting, MAX_PER_RUN, VOTERS_WHO_CAN_SEE };
