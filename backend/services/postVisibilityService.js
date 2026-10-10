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
//   3c. a page post (B14): always public (pages are public entities, even
//       when the owner's personal account is private).
// Callers answer 404 (not 403) when this returns null, so a direct link
// never confirms that a hidden post exists.
const db = require('../db');
const blockService = require('./blockService');

// Returns { id, user_id, community_id } for a visible post, or null if it
// doesn't exist or the viewer (null = logged out) isn't allowed to see it.
async function getVisiblePost(postId, viewerId) {
  const result = await db.query(
    `SELECT posts.id, posts.user_id, posts.visibility, posts.community_id, posts.page_id,
       users.is_private, users.is_deactivated,
       $2::int IS NOT NULL AND EXISTS(
         SELECT 1 FROM follows
         WHERE follows.follower_id = $2 AND follows.following_id = users.id AND follows.status = 'accepted'
       ) AS viewer_is_follower,
       -- Day 47: the viewer is on the author's close friends list.
       $2::int IS NOT NULL AND EXISTS(
         SELECT 1 FROM close_friends cf WHERE cf.user_id = users.id AND cf.friend_id = $2
       ) AS viewer_is_close_friend,
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
  // Day 50: viewer_is_community_member -- only members comment and react in
  // a group (communityService.assertCanInteract).
  const summary = {
    id: post.id, user_id: post.user_id, community_id: post.community_id, page_id: post.page_id,
    viewer_is_community_member: post.viewer_is_community_member
  };
  const isAuthor = viewerId != null && viewerId === post.user_id;
  if (isAuthor) return summary;

  if (post.is_deactivated) return null;
  // Day 20: an "only me" post is for its author alone.
  if (post.visibility === 'only_me') return null;
  if (viewerId != null && (await blockService.isBlocked(viewerId, post.user_id))) return null;
  // Day 47: a close-friends post is for the people on the author's list.
  if (post.visibility === 'close_friends') return post.viewer_is_close_friend ? summary : null;

  if (post.community_id) {
    if (post.community_privacy === 'private' && !post.viewer_is_community_member) return null;
    return summary;
  }
  if (post.page_id) return summary;
  if ((post.is_private || post.visibility === 'followers') && !post.viewer_is_follower) return null;

  return summary;
}

// SQL condition "viewer (a $N, or NULL when logged out) may see this post
// (alias posts, its author alias users)" by its audience -- every listing
// uses this one clause (Day 47; it used to be copied into seven queries):
// public posts of public accounts and pages; your own posts; public and
// followers-only posts of people you follow; close-friends posts of people
// whose list you're on. "Only me" is the author's alone. Blocks, groups and
// deactivated authors are each listing's own conditions.
function postAudienceSql(viewer) {
  return `(
    ((NOT users.is_private OR posts.page_id IS NOT NULL) AND posts.visibility = 'public')
    OR users.id = ${viewer}
    OR (posts.visibility IN ('public', 'followers') AND EXISTS (SELECT 1 FROM follows WHERE follows.follower_id = ${viewer} AND follows.following_id = users.id AND follows.status = 'accepted'))
    OR (posts.visibility = 'close_friends' AND EXISTS (SELECT 1 FROM close_friends cf WHERE cf.user_id = users.id AND cf.friend_id = ${viewer}))
  )`;
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

module.exports = { getVisiblePost, communityVisibleSql, postAudienceSql };
