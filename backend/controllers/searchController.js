const db = require('../db');
const { pageColumnSql } = require('../services/reactionService');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');
const { escapeLike } = require('../utils/escapeLike');

// Day 42: post search ranks only the newest SEARCH_CANDIDATES matches, so
// a common word reads a bounded number of rows (the planner walks posts
// newest first and stops), while a rare one comes straight from the
// indexes.
const SEARCH_CANDIDATES = 500;

// People whose username contains the query. Ranked like the big apps: the
// exact name first, then names starting with it, then people you follow,
// then shorter (closer) names. At most 20.
async function searchUsers(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).send('Search query is required');
    }
    const viewerId = req.userId ?? null;
    const result = await db.query(
      `SELECT users.id, users.username, users.bio, users.avatar_url,
         $2::int IS NOT NULL AND EXISTS (
           SELECT 1 FROM follows
           WHERE follows.follower_id = $2 AND follows.following_id = users.id AND follows.status = 'accepted'
         ) AS is_following
       FROM users
       WHERE users.username ILIKE '%' || $1 || '%'
         AND NOT users.is_deactivated
         AND ($2::int IS NULL OR NOT EXISTS (
           SELECT 1 FROM blocks
           WHERE (blocks.blocker_id = $2 AND blocks.blocked_id = users.id)
              OR (blocks.blocker_id = users.id AND blocks.blocked_id = $2)
         ))
       ORDER BY LOWER(users.username) = LOWER($3) DESC,
         users.username ILIKE $1 || '%' DESC,
         is_following DESC,
         LENGTH(users.username), users.username
       LIMIT 20`,
      [escapeLike(q), viewerId, q]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    sendServerError(res, err, 'Search users failed. Please try again later.');
  }
}

// Posts matching the query, either way:
// - as words (Postgres full-text search, English stemming: "running"
//   finds "run"; websearch syntax: "quoted phrases", -excluded words), on
//   idx_posts_content_fts;
// - as a piece of text, for scripts without spaces between words
//   (Burmese) and partial words, on idx_posts_content_trgm.
// Ranked by relevance (word rank, plus a bonus when the whole query
// appears as typed) x popularity (log of reactions + 2 x comments, so a
// viral post doesn't drown everything) x freshness (1 / (1 + age/30 days)).
async function searchPosts(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).send('Search query is required');
    }
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });
    const viewerId = req.userId ?? null;

    const result = await db.query(`
      WITH candidates AS (
        SELECT posts.id
        FROM posts
        JOIN users ON posts.user_id = users.id
        -- B13: community posts live in their community feed only.
        WHERE posts.community_id IS NULL
          AND (to_tsvector('english', posts.content) @@ websearch_to_tsquery('english', $1)
               OR posts.content ILIKE '%' || $2 || '%')
          AND ($3::int IS NULL OR NOT EXISTS (
            SELECT 1 FROM blocks
            WHERE (blocks.blocker_id = $3 AND blocks.blocked_id = posts.user_id)
               OR (blocks.blocker_id = posts.user_id AND blocks.blocked_id = $3)
          ))
          AND (
            ((NOT users.is_private OR posts.page_id IS NOT NULL) AND posts.visibility = 'public')
            OR users.id = $3
            OR (posts.visibility <> 'only_me' AND EXISTS (SELECT 1 FROM follows WHERE follows.follower_id = $3 AND follows.following_id = users.id AND follows.status = 'accepted'))
          )
          AND NOT users.is_deactivated
        ORDER BY posts.created_at DESC
        LIMIT ${SEARCH_CANDIDATES}
      )
      SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
        ${pageColumnSql()}
      FROM candidates
      JOIN posts ON posts.id = candidates.id
      JOIN users ON posts.user_id = users.id
      ORDER BY
        (ts_rank_cd(to_tsvector('english', posts.content), websearch_to_tsquery('english', $1), 32)
          + CASE WHEN posts.content ILIKE '%' || $2 || '%' THEN 0.5 ELSE 0 END)
        * ln(2 + (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id)
               + 2 * (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id))
        / (1 + EXTRACT(EPOCH FROM (now() - posts.created_at)) / 86400 / 30) DESC,
        posts.id DESC
      LIMIT $4 OFFSET $5
    `, [q, escapeLike(q), viewerId, limit + 1, offset]);

    const hasMore = result.rows.length > limit;
    const posts = hasMore ? result.rows.slice(0, limit) : result.rows;
    res.status(200).json({ page, limit, posts, hasMore });
  } catch (err) {
    sendServerError(res, err, 'Search posts failed. Please try again later.');
  }
}

module.exports = { searchUsers, searchPosts, SEARCH_CANDIDATES };
