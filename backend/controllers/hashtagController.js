const db = require('../db');
const { noBlockBetweenSql } = require('../services/blockService');
const { postAudienceSql } = require('../services/postVisibilityService');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql } = require('../services/reactionService');
const { pollColumnSql } = require('../services/pollService');
const { popularityScoreSql } = require('../services/popularity');
const { sendError } = require('../utils/httpError');
const { getPagination } = require('../utils/pagination');
const { normalizeTag } = require('../services/hashtagService');
const { toUnicode } = require('../utils/myanmarText');

// Day 40: Top ranks only the tag's newest TOP_CANDIDATES visible posts, so
// a request reads a bounded number of rows however old and busy the tag
// is. The time decay already makes older posts rank low on a busy tag; a
// quiet tag's Top simply covers more of its history.
const TOP_CANDIDATES = 500;

// The tag's posts the viewer ($1) may see. $2 is the lower-cased tag. Same
// block-filtering as getPosts -- this is a filtered view of the public post
// stream, not a separate feature with its own visibility rules.
const TAGGED_VISIBLE_SQL = `
  FROM post_hashtags
  JOIN posts ON posts.id = post_hashtags.post_id
  JOIN users ON users.id = posts.user_id
  -- Day 27: the tag's id is looked up first (a subquery, not a join), so
  -- Postgres knows it up front and can walk this tag's index entries
  -- newest first, stopping once enough rows are found.
  WHERE post_hashtags.hashtag_id = (SELECT id FROM hashtags WHERE LOWER(tag) = $2)
    -- B13: community posts live in their community feed only.
    AND posts.community_id IS NULL
    AND ($1::int IS NULL OR ${noBlockBetweenSql('$1', 'posts.user_id')})
    AND ${postAudienceSql('$1')}
    AND NOT users.is_deactivated`;

// The post card's columns, for `posts` joined with `users`.
const POST_COLUMNS_SQL = `
  posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
  (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
  $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
  ${reactionColumnsSql('$1')},
  ${mediaColumnSql()},
  ${pollColumnSql('$1')},
  ${pageColumnSql()},
  $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me`;

// Day 27: newest first by post id, which is creation order (ids are handed
// out as posts are created). Unlike created_at, it lives in post_hashtags
// itself, so a popular tag's page reads its newest few rows from
// idx_post_hashtags_hashtag instead of every tagged post.
const RECENT_SQL = `
  SELECT ${POST_COLUMNS_SQL}
  ${TAGGED_VISIBLE_SQL}
  ORDER BY post_hashtags.post_id DESC
  LIMIT $3 OFFSET $4`;

// Day 40: the newest candidates (same index walk as Recent), ranked by the
// Explore score (services/popularity.js); ties go to the newer post.
const TOP_SQL = `
  WITH candidates AS (
    SELECT posts.id
    ${TAGGED_VISIBLE_SQL}
    ORDER BY post_hashtags.post_id DESC
    LIMIT ${TOP_CANDIDATES}
  )
  SELECT ${POST_COLUMNS_SQL}
  FROM candidates
  JOIN posts ON posts.id = candidates.id
  JOIN users ON users.id = posts.user_id
  ORDER BY ${popularityScoreSql(
    '(SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id)',
    '(SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND NOT comments.awaiting_approval)',
    'posts.created_at'
  )} DESC, posts.id DESC
  LIMIT $3 OFFSET $4`;

// GET /hashtags/:tag/posts?sort=recent|top (recent by default).
async function getPostsByHashtag(req, res) {
  try {
    // Day 43: tags are kept in Unicode, NFC (hashtagService.normalizeTag).
    const tag = normalizeTag(toUnicode((req.params.tag || '').trim()));
    if (!tag) {
      return res.status(400).send('A hashtag is required');
    }
    const sort = req.query.sort ?? 'recent';
    if (sort !== 'recent' && sort !== 'top') {
      return res.status(400).send('Sort must be recent or top');
    }
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });
    const viewerId = req.userId ?? null;

    const result = await db.query(sort === 'top' ? TOP_SQL : RECENT_SQL, [viewerId, tag, limit + 1, offset]);

    const hasMore = result.rows.length > limit;
    const posts = hasMore ? result.rows.slice(0, limit) : result.rows;

    res.json({ tag, sort, page, posts, hasMore });
  } catch (err) {
    sendError(res, err, 'Fetch posts by hashtag failed. Please try again later.');
  }
}

module.exports = { getPostsByHashtag, TOP_CANDIDATES };
