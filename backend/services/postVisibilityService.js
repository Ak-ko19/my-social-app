// Single source of truth for "may this viewer see this post" -- the same
// three rules getPost (postController) applies, so every route that reads
// from or writes to a post by id (comments, likes, bookmarks) enforces
// them identically instead of only checking that the post exists:
//   1. a deactivated author's posts are visible only to the author;
//   2. a block in either direction hides the post (mutual invisibility);
//   3. a private author's posts -- and any post marked visibility =
//      'followers' (B5) -- are visible only to the author and accepted
//      followers.
// Callers answer 404 (not 403) when this returns null, same as getPost,
// so a direct link never confirms that a hidden post exists.
const db = require('../db');
const blockService = require('./blockService');

// Returns { id, user_id } for a visible post, or null if it doesn't exist
// or the viewer (null = logged out) isn't allowed to see it.
async function getVisiblePost(postId, viewerId) {
  const result = await db.query(
    `SELECT posts.id, posts.user_id, posts.visibility,
       users.is_private, users.is_deactivated,
       $2::int IS NOT NULL AND EXISTS(
         SELECT 1 FROM follows
         WHERE follows.follower_id = $2 AND follows.following_id = users.id AND follows.status = 'accepted'
       ) AS viewer_is_follower
     FROM posts
     JOIN users ON posts.user_id = users.id
     WHERE posts.id = $1`,
    [postId, viewerId ?? null]
  );
  if (result.rows.length === 0) return null;

  const post = result.rows[0];
  const isAuthor = viewerId != null && viewerId === post.user_id;
  if (isAuthor) return { id: post.id, user_id: post.user_id };

  if (post.is_deactivated) return null;
  if (viewerId != null && (await blockService.isBlocked(viewerId, post.user_id))) return null;
  if ((post.is_private || post.visibility === 'followers') && !post.viewer_is_follower) return null;

  return { id: post.id, user_id: post.user_id };
}

module.exports = { getVisiblePost };
