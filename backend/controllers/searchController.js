const db = require('../db');
const { postAudienceSql } = require('../services/postVisibilityService');
const { pageColumnSql } = require('../services/reactionService');
const { sendError } = require('../utils/httpError');
const { getPagination } = require('../utils/pagination');
const { escapeLike } = require('../utils/escapeLike');
const { toUnicode } = require('../utils/myanmarText');
const { normalizeTag } = require('../services/hashtagService');

// Day 42: post search ranks only the newest SEARCH_CANDIDATES matches, so
// a common word reads a bounded number of rows (the planner walks posts
// newest first and stops), while a rare one comes straight from the
// indexes.
const SEARCH_CANDIDATES = 500;

// People whose username contains the query. Ranked like the big apps: the
// exact name first, then names starting with it, then people you follow,
// then shorter (closer) names. At most 20.
// Day 43: usernames are kept as typed (never converted), so a Zawgyi
// query matches a name either as typed or converted to Unicode.
async function searchUsers(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).send('Search query is required');
    }
    const unicode = toUnicode(q);
    const viewerId = req.userId ?? null;
    const result = await db.query(
      `SELECT users.id, users.username, users.bio, users.avatar_url,
         $2::int IS NOT NULL AND EXISTS (
           SELECT 1 FROM follows
           WHERE follows.follower_id = $2 AND follows.following_id = users.id AND follows.status = 'accepted'
         ) AS is_following
       FROM users
       WHERE (users.username ILIKE '%' || $1 || '%' OR users.username ILIKE '%' || $4 || '%')
         AND NOT users.is_deactivated
         AND ($2::int IS NULL OR NOT EXISTS (
           SELECT 1 FROM blocks
           WHERE (blocks.blocker_id = $2 AND blocks.blocked_id = users.id)
              OR (blocks.blocker_id = users.id AND blocks.blocked_id = $2)
         ))
       ORDER BY LOWER(users.username) IN (LOWER($3), LOWER($5)) DESC,
         (users.username ILIKE $1 || '%' OR users.username ILIKE $4 || '%') DESC,
         is_following DESC,
         LENGTH(users.username), users.username
       LIMIT 20`,
      [escapeLike(q), viewerId, q, escapeLike(unicode), unicode]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    sendError(res, err, 'Search users failed. Please try again later.');
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
    // Day 43: posts are stored as Unicode, so a Zawgyi query is converted.
    const q = toUnicode((req.query.q || '').trim());
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
          AND ${postAudienceSql('$3')}
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
               + 2 * (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND NOT comments.awaiting_approval))
        / (1 + EXTRACT(EPOCH FROM (now() - posts.created_at)) / 86400 / 30) DESC,
        posts.id DESC
      LIMIT $4 OFFSET $5
    `, [q, escapeLike(q), viewerId, limit + 1, offset]);

    const hasMore = result.rows.length > limit;
    const posts = hasMore ? result.rows.slice(0, limit) : result.rows;
    res.status(200).json({ page, limit, posts, hasMore });
  } catch (err) {
    sendError(res, err, 'Search posts failed. Please try again later.');
  }
}

// Hashtag search counts at most TAG_COUNT_CAP posts per tag ("500+"), so
// a busy tag costs no more than a quiet one.
const TAG_COUNT_CAP = 500;

// Tags containing the query (a leading # is ignored). The 20 closest (the
// exact tag, then tags starting with it, then shorter ones) are listed
// exact first, then those starting with it, each by most used. Counts are of publicly visible posts only, like trending (B7) --
// a private post's tag is never revealed, not even as a number, so a tag
// with no public posts is left out.
async function searchHashtags(req, res) {
  try {
    const q = normalizeTag(toUnicode((req.query.q || '').trim()).replace(/^#+/, ''));
    if (!q) {
      return res.status(400).send('Search query is required');
    }
    const result = await db.query(
      `WITH matches AS (
         SELECT hashtags.id, hashtags.tag FROM hashtags
         WHERE LOWER(hashtags.tag) LIKE '%' || $1 || '%'
         ORDER BY LOWER(hashtags.tag) = $2 DESC, LOWER(hashtags.tag) LIKE $1 || '%' DESC, LENGTH(hashtags.tag), hashtags.tag
         LIMIT 20
       )
       SELECT matches.tag, counts.post_count
       FROM matches
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS post_count FROM (
           SELECT 1 FROM post_hashtags
           JOIN posts ON posts.id = post_hashtags.post_id
           JOIN users ON users.id = posts.user_id
           WHERE post_hashtags.hashtag_id = matches.id
             AND posts.community_id IS NULL
             AND (NOT users.is_private OR posts.page_id IS NOT NULL) AND posts.visibility = 'public'
             AND NOT users.is_deactivated
           LIMIT ${TAG_COUNT_CAP}
         ) visible
       ) counts
       WHERE counts.post_count > 0
       ORDER BY LOWER(matches.tag) = $2 DESC, LOWER(matches.tag) LIKE $1 || '%' DESC, counts.post_count DESC, LENGTH(matches.tag), matches.tag`,
      [escapeLike(q), q]
    );
    res.status(200).json(result.rows.map((row) => ({ ...row, capped: row.post_count >= TAG_COUNT_CAP })));
  } catch (err) {
    sendError(res, err, 'Search hashtags failed. Please try again later.');
  }
}

module.exports = { searchUsers, searchPosts, searchHashtags, SEARCH_CANDIDATES, TAG_COUNT_CAP };
