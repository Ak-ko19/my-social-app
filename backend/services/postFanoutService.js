// Day 113: "X posted in GROUP" / "PAGE posted" (Day 101) without making the
// person posting wait for a big audience.
//
// A group or page with at most INLINE_MAX members / followers (the stored
// counts, migration 092) is told inside the post request, as before -- one
// INSERT, instant. A bigger one goes to post_fanout_queue (migration 095)
// and is sent here in chunks of CHUNK people in user order: each chunk's
// notifications and the job's cursor commit together, so nobody is told
// twice or skipped, whichever instance runs it (FOR UPDATE SKIP LOCKED).
// Pushes and badge updates follow each committed chunk.
//
// Drained right after the post is saved (in the background), by the
// ticker every 30 s, and by the daily cleanup as the backstop. Under
// NODE_ENV=test nothing drains in the background: tests call drain().
const db = require('../db');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');

const CHUNK = 1000;
const DEFAULT_INLINE_MAX = 200;
// One pass stops starting new chunks after this long (the next pass
// continues where it stopped).
const PASS_BUDGET_MS = 10 * 1000;

function inlineMax() {
  const set = process.env.POST_FANOUT_INLINE_MAX;
  return set !== undefined && set !== '' ? Number(set) : DEFAULT_INLINE_MAX;
}

// How many may hear about it: the group's members or the page's followers.
async function audienceSize(post) {
  const result = post.community_id
    ? await db.query('SELECT member_count AS n FROM communities WHERE id = $1', [post.community_id])
    : await db.query('SELECT follower_count AS n FROM pages WHERE id = $1', [post.page_id]);
  return result.rows.length ? result.rows[0].n : 0;
}

// One chunk of one waiting job, in its own transaction. Returns how many
// were told, or null when no job is free.
async function drainOneChunk(chunk) {
  const client = await db.connect();
  let post;
  let userIds;
  try {
    await client.query('BEGIN');
    const job = await client.query(
      `SELECT q.post_id, q.after_user_id, p.id, p.user_id, p.community_id, p.page_id
       FROM post_fanout_queue q JOIN posts p ON p.id = q.post_id
       ORDER BY q.queued_at, q.post_id
       LIMIT 1
       FOR UPDATE OF q SKIP LOCKED`
    );
    if (job.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    post = job.rows[0];
    userIds = await notificationService.insertNewPostNotifications(post, { client, afterUserId: post.after_user_id, limit: chunk });
    if (userIds.length < chunk) {
      await client.query('DELETE FROM post_fanout_queue WHERE post_id = $1', [post.post_id]);
    } else {
      await client.query('UPDATE post_fanout_queue SET after_user_id = $2 WHERE post_id = $1', [post.post_id, Math.max(...userIds)]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  notificationService.deliverNewPost(post, userIds);
  return userIds.length;
}

// Sends waiting chunks until the queue is empty or the pass's time is up.
// { notified, chunks }. (chunk / maxChunks: smaller steps, for tests.)
async function drain({ budgetMs = PASS_BUDGET_MS, chunk = CHUNK, maxChunks = Infinity } = {}) {
  const until = Date.now() + budgetMs;
  let notified = 0;
  let chunks = 0;
  while (Date.now() < until && chunks < maxChunks) {
    const told = await drainOneChunk(chunk);
    if (told === null) break;
    notified += told;
    chunks += 1;
  }
  return { notified, chunks };
}

let kicking = false;
let kickAgain = false;
// Start draining now, without waiting (after a big post is queued). One
// drain at a time per instance; a kick during one runs another pass after
// it (a job queued just as it found the queue empty would otherwise wait
// for the ticker). The ticker picks up anything a pass's budget left.
function kick() {
  if (process.env.NODE_ENV === 'test') return;
  if (kicking) {
    kickAgain = true;
    return;
  }
  kicking = true;
  kickAgain = false;
  setImmediate(() => {
    drain()
      .catch((err) => logger.error('new-post notifications failed', { err }))
      .finally(() => {
        kicking = false;
        if (kickAgain) kick();
      });
  });
}

// After a post is saved (postCreationService.finishPost): tell its group /
// page's audience now if it is small, or queue it.
async function announceNewPost(post) {
  if (!post.community_id && !post.page_id) return { inline: 0, queued: false };
  if ((await audienceSize(post)) <= inlineMax()) {
    return { inline: await notificationService.notifyNewPost(post), queued: false };
  }
  await db.query('INSERT INTO post_fanout_queue (post_id) VALUES ($1) ON CONFLICT (post_id) DO NOTHING', [post.id]);
  kick();
  return { inline: 0, queued: true };
}

// How many posts are waiting (the cleanup's dry run).
async function countWaiting() {
  return (await db.query('SELECT count(*)::int AS n FROM post_fanout_queue')).rows[0].n;
}

module.exports = { announceNewPost, drain, countWaiting, CHUNK, DEFAULT_INLINE_MAX };
