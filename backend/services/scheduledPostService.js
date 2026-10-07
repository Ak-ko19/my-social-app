// Day 45 step 2: publishes scheduled posts when their time comes -- from
// the server's 30 s ticker (services/ticker.js) and the daily cleanup.
// Several server instances (or a tick overlapping the cleanup) are safe:
// each due draft is taken with FOR UPDATE SKIP LOCKED, published and
// removed in one transaction -- so it can only go up once.
const db = require('../db');
const draftService = require('./draftService');
const postCreation = require('./postCreationService');
const notificationService = require('./notificationService');
const { banState } = require('./moderationService');

const { PostInputError } = postCreation;

// Per run, so one run stays short; the rest go on the next tick.
const MAX_PER_RUN = 25;

const DUE_SQL = 'scheduled_for IS NOT NULL AND scheduled_for <= now()';

// Banned, suspended or deactivated: the author can't post at all now.
async function accountCanPost(userId) {
  const user = (await db.query('SELECT is_deactivated, banned_at, banned_until FROM users WHERE id = $1', [userId])).rows[0];
  return Boolean(user) && !user.is_deactivated && banState(user) === 'none';
}

// Takes the next due draft and publishes it, or puts it back among the
// drafts with the reason. Returns 'published' | 'failed' | null (nothing
// due). An unexpected error is thrown, and the draft stays due (retried).
async function publishNext() {
  const client = await db.connect();
  let outcome;
  try {
    await client.query('BEGIN');
    const row = (await client.query(
      `SELECT * FROM post_drafts WHERE ${DUE_SQL} ORDER BY scheduled_for, id LIMIT 1 FOR UPDATE SKIP LOCKED`
    )).rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }
    try {
      if (!(await accountCanPost(row.user_id))) throw new PostInputError(403, "Your account can't post right now");
      const postRow = await draftService.publishRow(client, row);
      outcome = { status: 'published', row, postRow };
    } catch (err) {
      if (!(err instanceof PostInputError)) throw err;
      // Back to being a draft, with the reason shown in the Drafts list.
      await client.query(
        'UPDATE post_drafts SET scheduled_for = NULL, last_error = $1, updated_at = now() WHERE id = $2',
        [err.message, row.id]
      );
      outcome = { status: 'failed', row };
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const { row } = outcome;
  if (outcome.status === 'published') {
    await postCreation.finishPost(outcome.postRow, row.user_id, draftService.fieldsOf(row), row.media_urls);
    await notificationService.notifySystem({ userId: row.user_id, type: 'scheduled_post', postId: outcome.postRow.id });
  } else {
    await notificationService.notifySystem({ userId: row.user_id, type: 'scheduled_failed' });
  }
  return outcome.status;
}

// Publishes what is due, up to MAX_PER_RUN. { published, failed }.
async function publishDue({ limit = MAX_PER_RUN } = {}) {
  const counts = { published: 0, failed: 0 };
  for (let i = 0; i < limit; i += 1) {
    const status = await publishNext();
    if (!status) break;
    counts[status] += 1;
  }
  return counts;
}

async function countDue() {
  return (await db.query(`SELECT COUNT(*)::int AS n FROM post_drafts WHERE ${DUE_SQL}`)).rows[0].n;
}

module.exports = { publishDue, publishNext, countDue, MAX_PER_RUN };
