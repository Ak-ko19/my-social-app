const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql } = require('../services/reactionService');

// B7 Explore. Both lists look at the last EXPLORE_WINDOW of activity.
const EXPLORE_WINDOW = "INTERVAL '7 days'";

// A post anyone may see: public account, public post (B5), author active.
// Trending counts use ONLY these, so a trend can never reveal activity in
// private or followers-only posts -- not even as a number.
const PUBLICLY_VISIBLE_SQL = `
  (NOT users.is_private OR posts.page_id IS NOT NULL) AND posts.visibility = 'public' AND NOT users.is_deactivated`;

// Hides authors the viewer ($1) has a block with, either direction.
const NOT_BLOCKED_SQL = `
  ($1::int IS NULL OR NOT EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocks.blocker_id = $1 AND blocks.blocked_id = posts.user_id)
       OR (blocks.blocker_id = posts.user_id AND blocks.blocked_id = $1)
  ))`;

// GET /explore/hashtags -- the most-used tags in the window, by how many
// distinct (publicly visible) posts used them; ties go to the most
// recently used. At most 10.
async function getTrendingHashtags(req, res) {
  try {
    const viewerId = req.userId ?? null;
    const result = await db.query(
      `SELECT hashtags.tag, COUNT(DISTINCT posts.id)::int AS post_count, MAX(posts.created_at) AS last_used_at
       FROM post_hashtags
       JOIN hashtags ON hashtags.id = post_hashtags.hashtag_id
       JOIN posts ON posts.id = post_hashtags.post_id
       JOIN users ON users.id = posts.user_id
       WHERE posts.community_id IS NULL -- B13: not in global explore
         AND posts.created_at > now() - ${EXPLORE_WINDOW}
         AND ${PUBLICLY_VISIBLE_SQL}
         AND ${NOT_BLOCKED_SQL}
       GROUP BY hashtags.id, hashtags.tag
       ORDER BY post_count DESC, last_used_at DESC
       LIMIT 10`,
      [viewerId]
    );
    res.json(result.rows.map(({ tag, post_count }) => ({ tag, post_count })));
  } catch (err) {
    sendServerError(res, err, 'Loading trending hashtags failed. Please try again later.');
  }
}

// GET /explore/posts -- popular recent posts the viewer can see, ranked by
// engagement with time decay (Hacker-News-style gravity), so a fresh post
// with some traction outranks an older one with slightly more:
//   score = (reactions + 2 * comments) / (hours_old + 2) ^ 1.5
// Comments weigh double -- they take more effort than a tap. Only posts
// with at least one reaction or comment qualify ("popular", not "recent").
async function getPopularPosts(req, res) {
  try {
    const viewerId = req.userId ?? null;
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 30 });
    const result = await db.query(
      `WITH scored AS (
         SELECT posts.id,
           (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) AS reactions,
           (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) AS comment_total
         FROM posts
         JOIN users ON users.id = posts.user_id
         WHERE posts.community_id IS NULL -- B13: not in global explore
         AND posts.created_at > now() - ${EXPLORE_WINDOW}
           AND ${NOT_BLOCKED_SQL}
           AND NOT users.is_deactivated
           AND (
             ((NOT users.is_private OR posts.page_id IS NOT NULL) AND posts.visibility = 'public')
             OR users.id = $1
             OR EXISTS (SELECT 1 FROM follows WHERE follows.follower_id = $1 AND follows.following_id = users.id AND follows.status = 'accepted')
           )
       )
       SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
         $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
         ${reactionColumnsSql('$1')},
         ${mediaColumnSql()},
        ${pageColumnSql()},
         scored.reactions::int AS like_count,
         scored.comment_total::int AS comment_count,
         $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me,
         (scored.reactions + 2 * scored.comment_total)
           / power(EXTRACT(EPOCH FROM (now() - posts.created_at)) / 3600 + 2, 1.5) AS score
       FROM scored
       JOIN posts ON posts.id = scored.id
       JOIN users ON users.id = posts.user_id
       WHERE scored.reactions + scored.comment_total > 0
       ORDER BY score DESC, posts.created_at DESC
       LIMIT $2 OFFSET $3`,
      [viewerId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    const posts = (hasMore ? result.rows.slice(0, limit) : result.rows).map(({ score, ...post }) => post);
    res.json({ posts, currentPage: page, hasMore });
  } catch (err) {
    sendServerError(res, err, 'Loading popular posts failed. Please try again later.');
  }
}

module.exports = { getTrendingHashtags, getPopularPosts };
