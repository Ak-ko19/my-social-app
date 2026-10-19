const db = require('../db');
const { noBlockBetweenSql } = require('../services/blockService');
const { sendError } = require('../utils/httpError');

const LIMIT = 10;

// Excludes: yourself, anyone you already follow OR have a pending request
// to, blocks in either direction, deactivated accounts. ($1 = viewer.)
const ELIGIBLE_SQL = `
  u.id <> $1
  AND NOT u.is_deactivated
  AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = u.id)
  -- Day 39: people you hid from suggestions stay hidden.
  AND NOT EXISTS (SELECT 1 FROM suggestion_dismissals sd WHERE sd.user_id = $1 AND sd.dismissed_user_id = u.id)
  AND ${noBlockBetweenSql('$1', 'u.id')}`;

// B8 "People you may know" -- GET /users/suggestions.
//
// 1. Network suggestions: people followed by the people you follow
//    (friends-of-friends), ranked by how many of your follows follow them,
//    plus people who follow YOU but you haven't followed back (a strong
//    signal, +2). Each carries a reason: mutual_count + a sample of up to
//    two mutual usernames, and/or follows_you.
//    Privacy: mutuals come only from YOUR accepted follows' following
//    lists -- which you're already allowed to see (A6 list rules).
// 2. Fallback so a brand-new account still gets suggestions: the
//    most-followed public accounts, reason "popular".
async function getSuggestions(req, res) {
  try {
    const viewerId = req.userId;
    const network = await db.query(
      `WITH my_follows AS (
         SELECT following_id AS user_id FROM follows WHERE follower_id = $1 AND status = 'accepted'
       ),
       friends_of_friends AS (
         SELECT f.following_id AS user_id, COUNT(*)::int AS mutual_count
         -- Day 27: walk the follows index once per person I follow, never
         -- the whole table. A plain join left that to the planner, which at
         -- some table sizes picked a full scan (e2e/day27-perf.cjs, flaky);
         -- a LATERAL subquery with OFFSET 0 can't be flattened into a join,
         -- so it is always this per-person lookup.
         FROM my_follows m
         CROSS JOIN LATERAL (
           SELECT f.following_id FROM follows f
           WHERE f.follower_id = m.user_id AND f.status = 'accepted'
           OFFSET 0
         ) f
         GROUP BY f.following_id
       ),
       my_followers AS (
         SELECT follower_id AS user_id FROM follows WHERE following_id = $1 AND status = 'accepted'
       )
       SELECT u.id, u.username, u.avatar_url, u.bio, u.is_private,
         COALESCE(fof.mutual_count, 0) AS mutual_count,
         EXISTS (SELECT 1 FROM my_followers mf WHERE mf.user_id = u.id) AS follows_you,
         ARRAY(
           SELECT mu.username FROM follows f2 JOIN users mu ON mu.id = f2.follower_id
           WHERE f2.following_id = u.id AND f2.status = 'accepted'
             AND f2.follower_id IN (SELECT user_id FROM my_follows)
           ORDER BY mu.username LIMIT 2
         ) AS mutual_sample
       FROM users u
       LEFT JOIN friends_of_friends fof ON fof.user_id = u.id
       WHERE (fof.user_id IS NOT NULL OR EXISTS (SELECT 1 FROM my_followers mf WHERE mf.user_id = u.id))
         AND ${ELIGIBLE_SQL}
       ORDER BY COALESCE(fof.mutual_count, 0)
                + CASE WHEN EXISTS (SELECT 1 FROM my_followers mf WHERE mf.user_id = u.id) THEN 2 ELSE 0 END DESC,
                u.id DESC
       LIMIT ${LIMIT}`,
      [viewerId]
    );

    const suggestions = network.rows.map((r) => ({ ...r, reason: r.follows_you ? 'follows_you' : 'mutuals' }));

    if (suggestions.length < LIMIT) {
      const exclude = suggestions.map((s) => s.id);
      const popular = await db.query(
        `SELECT u.id, u.username, u.avatar_url, u.bio, u.is_private,
           0 AS mutual_count, false AS follows_you, ARRAY[]::text[] AS mutual_sample,
           (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id AND f.status = 'accepted')::int AS follower_count
         FROM users u
         WHERE NOT u.is_private AND u.id <> ALL($2::int[])
           AND ${ELIGIBLE_SQL}
         ORDER BY follower_count DESC, u.id DESC
         LIMIT $3`,
        [viewerId, exclude, LIMIT - suggestions.length]
      );
      for (const row of popular.rows) {
        const { follower_count, ...rest } = row;
        suggestions.push({ ...rest, follower_count, reason: 'popular' });
      }
    }

    res.json(suggestions);
  } catch (err) {
    sendError(res, err, 'Loading suggestions failed. Please try again later.');
  }
}

// Day 39: POST /users/suggestions/:id/dismiss -- hide this person from your
// suggestions (like the X on Facebook's / Instagram's). Idempotent; it
// doesn't block or unfollow anyone and they aren't told.
async function dismissSuggestion(req, res) {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).send('Invalid user ID');
    if (targetId === req.userId) return res.status(400).send("You can't hide yourself");
    const result = await db.query(
      `INSERT INTO suggestion_dismissals (user_id, dismissed_user_id)
       SELECT $1, id FROM users WHERE id = $2
       ON CONFLICT DO NOTHING
       RETURNING dismissed_user_id`,
      [req.userId, targetId]
    );
    if (result.rows.length === 0) {
      const exists = await db.query('SELECT 1 FROM users WHERE id = $1', [targetId]);
      if (exists.rows.length === 0) return res.status(404).send('User not found');
    }
    res.status(204).end();
  } catch (err) {
    sendError(res, err, 'Hiding the suggestion failed. Please try again later.');
  }
}

module.exports = { getSuggestions, dismissSuggestion };
