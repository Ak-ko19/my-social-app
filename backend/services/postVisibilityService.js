// Single source of truth for "may this viewer see this post" -- every route
// that reads from or writes to a post by id (the post itself, comments,
// likes, reactions, bookmarks) goes through getVisiblePost, so they all
// enforce the same rules instead of only checking that the post exists:
//   1. a deactivated (or banned) author's posts are visible only to the
//      author;
//   2. a block in either direction hides the post (mutual invisibility);
//   3a. a normal post: a private author's posts -- and any post marked
//       visibility = 'followers' (B5) -- are visible only to the author
//       and accepted followers;
//   3b. a community post (B13): visible to anyone if the community is
//       public, otherwise only to its members; the author's own feed
//       audience doesn't apply inside a community.
// Callers answer 404 (not 403) when this returns null, so a direct link
// never confirms that a hidden post exists.
const db = require('../db');
const blockService = require('./blockService');

// Returns { id, user_id, community_id } for a visible post, or null if it
// doesn't exist or the viewer (null = logged out) isn't allowed to see it.
async function getVisiblePost(postId, viewerId) {
  const result = await db.query(
    `SELECT posts.id, posts.user_id, posts.visibility, posts.community_id,
       users.is_private, users.is_deactivated,
       $2::int IS NOT NULL AND EXISTS(
         SELECT 1 FROM follows
         WHERE follows.follower_id = $2 AND follows.following_id = users.id AND follows.status = 'accepted'
       ) AS viewer_is_follower,
       c.privacy AS community_privacy,
       $2::int IS NOT NULL AND EXISTS(
         SELECT 1 FROM community_members cm
         WHERE cm.community_id = posts.community_id AND cm.user_id = $2 AND cm.status = 'member'
       ) AS viewer_is_community_member
     FROM posts
     JOIN users ON posts.user_id = users.id
     LEFT JOIN communities c ON c.id = posts.community_id
     WHERE posts.id = $1`,
    [postId, viewerId ?? null]
  );
  if (result.rows.length === 0) return null;

  const post = result.rows[0];
  const summary = { id: post.id, user_id: post.user_id, community_id: post.community_id };
  const isAuthor = viewerId != null && viewerId === post.user_id;
  if (isAuthor) return summary;

  if (post.is_deactivated) return null;
  if (viewerId != null && (await blockService.isBlocked(viewerId, post.user_id))) return null;

  if (post.community_id) {
    if (post.community_privacy === 'private' && !post.viewer_is_community_member) return null;
    return summary;
  }
  if ((post.is_private || post.visibility === 'followers') && !post.viewer_is_follower) return null;

  return summary;
}

// SQL condition "this post (alias posts) is either a normal post or a
// community post the viewer ($N) may read" -- for listings that can
// contain community posts (e.g. bookmarks).
function communityVisibleSql(viewerParam) {
  return `(posts.community_id IS NULL OR EXISTS (
    SELECT 1 FROM communities co
    WHERE co.id = posts.community_id
      AND (co.privacy = 'public' OR EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.community_id = co.id AND cm.user_id = ${viewerParam} AND cm.status = 'member'
      ))
  ))`;
}

module.exports = { getVisiblePost, communityVisibleSql };
