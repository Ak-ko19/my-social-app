// B1 reactions. A reaction is a row in `likes` with a `reaction` type
// (migration 016) -- one per user per post, enforced by likes'
// UNIQUE(post_id, user_id). 'like' is the default, so the original
// like/unlike API keeps working and "like count" means "total reactions".
const db = require('../db');
const { noBlockBetweenSql } = require('./blockService');

// Keep in sync with migration 016's CHECK constraint and the frontend's
// utils/reactions.js.
const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

function isValidReaction(value) {
  return REACTIONS.includes(value);
}

// Authoritative totals for one post, returned by every reaction mutation
// so the frontend's optimistic UI can reconcile.
// reactionCounts only includes types with at least one reaction, e.g.
// { like: 3, love: 1 }.
async function getReactionSummary(postId) {
  const result = await db.query(
    'SELECT reaction, COUNT(*)::int AS count FROM likes WHERE post_id = $1 GROUP BY reaction',
    [postId]
  );
  const reactionCounts = {};
  let likeCount = 0;
  for (const row of result.rows) {
    reactionCounts[row.reaction] = row.count;
    likeCount += row.count;
  }
  return { likeCount, reactionCounts };
}

// SQL fragments for post-listing queries (feed, posts, post detail,
// hashtag feed, bookmarks), so every place that returns a post exposes
// the same reaction fields. `viewerParam` is the query's placeholder for
// the viewer id (may be NULL for a logged-out viewer).
function reactionColumnsSql(viewerParam) {
  return `
    (SELECT likes.reaction FROM likes WHERE likes.post_id = posts.id AND likes.user_id = ${viewerParam}) AS my_reaction,
    (SELECT COALESCE(json_object_agg(rc.reaction, rc.count), '{}'::json)
       FROM (SELECT likes.reaction, COUNT(*)::int AS count FROM likes WHERE likes.post_id = posts.id GROUP BY likes.reaction) rc
    ) AS reaction_counts`;
}

// B2: a post's images in display order, as [{ url }], from post_media
// (migration 017). Lives here next to reactionColumnsSql because both are
// injected into the same post-listing queries; '[]' when a post has none.
function mediaColumnSql() {
  return `
    (SELECT COALESCE(json_agg(json_build_object('url', pm.url) ORDER BY pm.position), '[]'::json)
       FROM post_media pm WHERE pm.post_id = posts.id
    ) AS media`;
}

// B14: { id, name } of the page a post was published as, or null -- the
// feed shows the page instead of the author for these. Needs the posts
// table aliased as "posts".
function pageColumnSql() {
  return `
    (SELECT json_build_object('id', pg.id, 'name', pg.name) FROM pages pg WHERE pg.id = posts.page_id) AS page`;
}

// Day 85: "12 comments" on the card, before the comments are opened -- the
// same comments the list would show the viewer: one waiting for approval
// counts only for its author and the post's owner, and none across a
// block (commentController.getComments). Replies count too. Read through
// idx_comments_post_id (migration 070).
function commentCountColumnSql(viewerParam) {
  return `
    (SELECT COUNT(*)::int FROM comments c
     WHERE c.post_id = posts.id
       AND (NOT c.awaiting_approval OR c.user_id = ${viewerParam}::int OR posts.user_id = ${viewerParam}::int)
       AND (${viewerParam}::int IS NULL OR ${noBlockBetweenSql(`${viewerParam}::int`, 'c.user_id')})) AS comment_count`;
}

module.exports = { REACTIONS, isValidReaction, getReactionSummary, reactionColumnsSql, mediaColumnSql, pageColumnSql, commentCountColumnSql };
