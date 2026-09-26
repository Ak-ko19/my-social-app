// B1 reactions. A reaction is a row in `likes` with a `reaction` type
// (migration 016) -- one per user per post, enforced by likes'
// UNIQUE(post_id, user_id). 'like' is the default, so the original
// like/unlike API keeps working and "like count" means "total reactions".
const db = require('../db');

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

module.exports = { REACTIONS, isValidReaction, getReactionSummary, reactionColumnsSql };
