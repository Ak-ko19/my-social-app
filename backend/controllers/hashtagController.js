const db = require('../db');
const { reactionColumnsSql } = require('../services/reactionService');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');

async function getPostsByHashtag(req, res) {
  try {
    const tag = (req.params.tag || '').trim().toLowerCase();
    if (!tag) {
      return res.status(400).send('A hashtag is required');
    }
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });
    const viewerId = req.userId ?? null;

    // Same block-filtering and liked_by_me/bookmarked_by_me shape as
    // getPosts -- this is a filtered view of the public post stream, not a
    // separate feature with its own visibility rules.
    const result = await db.query(`
      SELECT posts.id, posts.content, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
        ${reactionColumnsSql('$1')},
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me
      FROM post_hashtags
      JOIN hashtags ON hashtags.id = post_hashtags.hashtag_id
      JOIN posts ON posts.id = post_hashtags.post_id
      JOIN users ON users.id = posts.user_id
      WHERE LOWER(hashtags.tag) = $2
        AND ($1::int IS NULL OR NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocks.blocker_id = $1 AND blocks.blocked_id = posts.user_id)
             OR (blocks.blocker_id = posts.user_id AND blocks.blocked_id = $1)
        ))
        AND (
          NOT users.is_private
          OR users.id = $1
          OR EXISTS (SELECT 1 FROM follows WHERE follows.follower_id = $1 AND follows.following_id = users.id AND follows.status = 'accepted')
        )
        AND NOT users.is_deactivated
      ORDER BY posts.created_at DESC
      LIMIT $3 OFFSET $4
    `, [viewerId, tag, limit + 1, offset]);

    const hasMore = result.rows.length > limit;
    const posts = hasMore ? result.rows.slice(0, limit) : result.rows;

    res.json({ tag, page, posts, hasMore });
  } catch (err) {
    sendServerError(res, err, 'Fetch posts by hashtag failed. Please try again later.');
  }
}

module.exports = { getPostsByHashtag };
