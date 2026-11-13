// Day 113: Explore's popular posts, ranked ahead of time.
//
// GET /explore/posts used to score every post of the last 7 days -- count
// its reactions and comments, check who may see it -- on every request,
// for every viewer. Now the server keeps a ranked list of the week's top
// public posts (explore_ranking, migration 093) and each request reads one
// page of it, checking every rule again for its viewer (exploreController).
//
// Only PUBLIC posts are ranked: public post, public account (or a page),
// active author, not in a group. Explore shows what anyone may see, like
// Instagram's and Facebook's; followers-only posts reach followers on Home.
//
// Rebuilt by the ticker every REFRESH_MS, and by a request that finds it
// older than STALE_AFTER (the ticker missed it, or the cache came back
// empty after a restart -- the tables are unlogged). One instance rebuilds
// at a time (advisory lock); the others keep serving the list they have.
const db = require('../db');
const { popularityScoreSql } = require('./popularity');

const DEFAULT_REFRESH_MS = 2 * 60 * 1000;
// The ranking holds at most this many posts: Explore's pages end there.
const RANKED = 1000;
const WINDOW = "INTERVAL '7 days'";
const LOCK_KEY = 'mysocialapp explore ranking';

// How often to rebuild. Under NODE_ENV=test it is 0 (rebuilt on every
// read, so suites can post, react and check Explore at once) unless
// EXPLORE_RANKING_MS is set -- the same rule as the trending cache.
function refreshMs() {
  const set = process.env.EXPLORE_RANKING_MS;
  if (set !== undefined && set !== '') return Number(set);
  return process.env.NODE_ENV === 'test' ? 0 : DEFAULT_REFRESH_MS;
}
// A request rebuilds only when the ticker is clearly behind.
const staleAfterMs = () => refreshMs() * 2.5;

// The week's public posts with any engagement, best first. Reactions and
// comments are counted per post here, once per rebuild -- not per request.
const RANK_SQL = `
  WITH scored AS (
    SELECT posts.id, posts.created_at,
      (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) AS reactions,
      (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND NOT comments.awaiting_approval) AS comment_total
    FROM posts
    JOIN users ON users.id = posts.user_id
    WHERE posts.created_at > now() - ${WINDOW}
      AND posts.community_id IS NULL
      AND posts.visibility = 'public'
      AND (NOT users.is_private OR posts.page_id IS NOT NULL)
      AND NOT users.is_deactivated
  ), ranked AS (
    SELECT id, ${popularityScoreSql('reactions', 'comment_total', 'created_at')} AS score, created_at
    FROM scored
    WHERE reactions + comment_total > 0
    ORDER BY score DESC, created_at DESC, id DESC
    LIMIT ${RANKED}
  )
  INSERT INTO explore_ranking (post_id, rank, score)
  SELECT id, row_number() OVER (ORDER BY score DESC, created_at DESC, id DESC), score FROM ranked`;

// Rebuilds the ranking: { refreshed: true, posts }, or { refreshed: false }.
// Readers never see it half-built: the old list stays until this commits.
// - wait false (the ticker): if another instance is rebuilding, leave it.
// - wait true (a request that found it stale): wait for that rebuild, then
//   skip if the list is now younger than ifOlderThanMs -- so a crowd of
//   requests causes one rebuild, not one each.
async function refresh({ wait = false, ifOlderThanMs = 0 } = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (wait) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
    } else {
      const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok', [LOCK_KEY]);
      if (!lock.rows[0].ok) {
        await client.query('ROLLBACK');
        return { refreshed: false };
      }
    }
    if (ifOlderThanMs > 0) {
      const age = await client.query('SELECT EXTRACT(EPOCH FROM (now() - refreshed_at)) * 1000 AS age FROM explore_ranking_state');
      if (age.rows.length && Number(age.rows[0].age) < ifOlderThanMs) {
        await client.query('COMMIT');
        return { refreshed: false };
      }
    }
    await client.query('DELETE FROM explore_ranking');
    const inserted = await client.query(RANK_SQL);
    // Fresh statistics, so reads walk the ranking in order (1,000 rows: cheap).
    await client.query('ANALYZE explore_ranking');
    await client.query(
      `INSERT INTO explore_ranking_state (id, refreshed_at) VALUES (true, now())
       ON CONFLICT (id) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at`
    );
    await client.query('COMMIT');
    return { refreshed: true, posts: inserted.rowCount };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// How old the ranking is, in ms (Infinity: never built, or emptied by a
// restart).
async function ageMs() {
  const result = await db.query('SELECT EXTRACT(EPOCH FROM (now() - refreshed_at)) * 1000 AS age FROM explore_ranking_state');
  return result.rows.length ? Number(result.rows[0].age) : Infinity;
}

// The ticker's job: rebuild when due.
async function refreshIfDue() {
  if ((await ageMs()) < refreshMs()) return { refreshed: false };
  return refresh();
}

// Before a read: rebuild only if the list is stale (one cheap query
// otherwise). Under NODE_ENV=test with no EXPLORE_RANKING_MS: every read.
async function ensureFresh() {
  const staleAfter = staleAfterMs();
  if ((await ageMs()) < staleAfter) return;
  await refresh({ wait: true, ifOlderThanMs: staleAfter });
}

module.exports = { refresh, refreshIfDue, ensureFresh, RANKED, DEFAULT_REFRESH_MS };
