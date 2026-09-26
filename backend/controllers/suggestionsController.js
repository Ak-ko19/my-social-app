const db = require('../db');
const { sendServerError } = require('../utils/sendError');

const LIMIT = 10;

// Excludes: yourself, anyone you already follow OR have a pending request
// to, blocks in either direction, deactivated accounts. ($1 = viewer.)
const ELIGIBLE_SQL = `
  u.id <> $1
  AND NOT u.is_deactivated
  AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1)
  )`;

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
         FROM follows f
         WHERE f.status = 'accepted' AND f.follower_id IN (SELECT user_id FROM my_follows)
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
    sendServerError(res, err, 'Loading suggestions failed. Please try again later.');
  }
}

module.exports = { getSuggestions };
