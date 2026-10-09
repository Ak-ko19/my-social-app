// Day 48: your activity log (Facebook's): what you liked and what you
// commented, newest first -- only on posts you can still see (the same rule
// as your saved posts). Private to you. Removing an item uses the usual
// endpoints (unlike, delete the comment); searches are /search/history.
const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');
const { STILL_VISIBLE_SQL } = require('../services/savedPostsService');

const SNIPPET = 140; // characters of a post or comment shown in the list

// The post a row is about (aliases posts, users).
const POST_COLUMNS = `posts.id AS post_id, LEFT(posts.content, ${SNIPPET}) AS post_content,
  users.id AS post_author_id, users.username AS post_author, users.avatar_url AS post_author_avatar`;

// A comment you may see: no block with its author, and not one waiting for
// someone else's approval (Day 47).
const COMMENT_VISIBLE_SQL = (c, cu) => `NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = $1 AND b.blocked_id = ${cu}.id) OR (b.blocker_id = ${cu}.id AND b.blocked_id = $1)
  )
  AND (NOT ${c}.awaiting_approval OR ${c}.user_id = $1 OR posts.user_id = $1)`;

// GET /activity/likes -- your reactions on posts and your comment likes,
// one list. kind: 'post' (reaction set) | 'comment' (comment_* set).
async function getLikes(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    // Each branch only needs its newest offset+limit+1 rows before merging.
    const result = await db.query(
      `SELECT * FROM (
         (SELECT 'post' AS kind, l.reaction, l.created_at::timestamptz AS created_at,
            NULL::int AS comment_id, NULL::text AS comment_content, NULL::text AS comment_author,
            ${POST_COLUMNS}
          FROM likes l
          JOIN posts ON posts.id = l.post_id
          JOIN users ON users.id = posts.user_id
          WHERE l.user_id = $1 AND ${STILL_VISIBLE_SQL}
          ORDER BY l.created_at DESC, l.id DESC
          LIMIT $2::int + $3::int)
         UNION ALL
         (SELECT 'comment' AS kind, NULL AS reaction, cl.created_at,
            c.id AS comment_id, LEFT(c.content, ${SNIPPET}) AS comment_content, cu.username AS comment_author,
            ${POST_COLUMNS}
          FROM comment_likes cl
          JOIN comments c ON c.id = cl.comment_id
          JOIN users cu ON cu.id = c.user_id
          JOIN posts ON posts.id = c.post_id
          JOIN users ON users.id = posts.user_id
          WHERE cl.user_id = $1 AND ${STILL_VISIBLE_SQL} AND ${COMMENT_VISIBLE_SQL('c', 'cu')}
          ORDER BY cl.created_at DESC, cl.comment_id DESC
          LIMIT $2::int + $3::int)
       ) liked
       ORDER BY created_at DESC, kind, post_id DESC, comment_id DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    res.json({ page, items: hasMore ? result.rows.slice(0, limit) : result.rows, hasMore });
  } catch (err) {
    sendServerError(res, err, 'Loading your likes failed. Please try again later.');
  }
}

// GET /activity/comments -- your comments, newest first.
async function getComments(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const result = await db.query(
      `SELECT c.id, LEFT(c.content, ${SNIPPET}) AS content, c.created_at::timestamptz AS created_at,
         c.parent_comment_id IS NOT NULL AS is_reply, ${POST_COLUMNS}
       FROM comments c
       JOIN posts ON posts.id = c.post_id
       JOIN users ON users.id = posts.user_id
       WHERE c.user_id = $1 AND ${STILL_VISIBLE_SQL}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    res.json({ page, items: hasMore ? result.rows.slice(0, limit) : result.rows, hasMore });
  } catch (err) {
    sendServerError(res, err, 'Loading your comments failed. Please try again later.');
  }
}

module.exports = { getLikes, getComments };
