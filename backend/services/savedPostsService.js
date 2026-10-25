// The saved posts a person may still see -- GET /bookmarks and (Day 46)
// a collection's posts share this one query, so both apply the same rules.
const db = require('../db');
const { noBlockBetweenSql } = require('../services/blockService');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql, commentCountColumnSql } = require('./reactionService');
const { shareColumnsSql } = require('./shareService');
const { pollColumnSql } = require('./pollService');
const { communityVisibleSql, postAudienceSql } = require('./postVisibilityService');

// SQL condition: the saved post (posts/users aliases) is one viewer $1 may
// see now. A saved post from someone you later blocked (or who blocked
// you), a group you left, a private account you stopped following, a post
// made "only me" or a deactivated author's stops showing up.
const STILL_VISIBLE_SQL = `
  ${communityVisibleSql('$1')}
  AND ${noBlockBetweenSql('$1', 'posts.user_id')}
  AND ${postAudienceSql('$1')}
  AND NOT users.is_deactivated`;

// One page of viewer's saved posts, newest saved first -- all of them, or
// (collectionId) only those in that collection, newest added first. Uses
// the "fetch one extra row" trick instead of COUNT(*). { posts, hasMore }.
async function listSaved(viewerId, { limit, offset, collectionId = null }) {
  const inCollection = collectionId === null
    ? ''
    : 'JOIN bookmark_collection_items items ON items.bookmark_id = bookmarks.id AND items.collection_id = $4';
  const params = [viewerId, limit + 1, offset];
  if (collectionId !== null) params.push(collectionId);
  const result = await db.query(`
    SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
      bookmarks.created_at AS bookmarked_at,
      (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
      EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
      ${reactionColumnsSql('$1')},
      ${mediaColumnSql()},
      ${pollColumnSql('$1')},
      ${commentCountColumnSql('$1')},
      ${shareColumnsSql('$1')},
      ${pageColumnSql()},
      true AS bookmarked_by_me
    FROM bookmarks
    ${inCollection}
    JOIN posts ON posts.id = bookmarks.post_id
    JOIN users ON users.id = posts.user_id
    WHERE bookmarks.user_id = $1
      AND ${STILL_VISIBLE_SQL}
    ORDER BY ${collectionId === null ? 'bookmarks.created_at' : 'items.added_at'} DESC, bookmarks.id DESC
    LIMIT $2 OFFSET $3
  `, params);
  const hasMore = result.rows.length > limit;
  return { posts: hasMore ? result.rows.slice(0, limit) : result.rows, hasMore };
}

module.exports = { listSaved, STILL_VISIBLE_SQL };
