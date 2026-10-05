const db = require('../db');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql } = require('../services/reactionService');
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
      SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
        ${reactionColumnsSql('$1')},
        ${mediaColumnSql()},
        ${pageColumnSql()},
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me
      FROM post_hashtags
      JOIN posts ON posts.id = post_hashtags.post_id
      JOIN users ON users.id = posts.user_id
      -- Day 27: the tag's id is looked up first (a subquery, not a join), so
      -- Postgres knows it up front and can walk this tag's index entries
      -- newest first, stopping once the page is full.
      WHERE post_hashtags.hashtag_id = (SELECT id FROM hashtags WHERE LOWER(tag) = $2)
        -- B13: community posts live in their community feed only.
        AND posts.community_id IS NULL
        AND ($1::int IS NULL OR NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocks.blocker_id = $1 AND blocks.blocked_id = posts.user_id)
             OR (blocks.blocker_id = posts.user_id AND blocks.blocked_id = $1)
        ))
        AND (
          ((NOT users.is_private OR posts.page_id IS NOT NULL) AND posts.visibility = 'public')
          OR users.id = $1
          OR (posts.visibility <> 'only_me' AND EXISTS (SELECT 1 FROM follows WHERE follows.follower_id = $1 AND follows.following_id = users.id AND follows.status = 'accepted'))
        )
        AND NOT users.is_deactivated
      -- Day 27: newest first by post id, which is creation order (ids are
      -- handed out as posts are created). Unlike created_at, it lives in
      -- post_hashtags itself, so a popular tag's page reads its newest few
      -- rows from idx_post_hashtags_hashtag instead of every tagged post.
      ORDER BY post_hashtags.post_id DESC
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
