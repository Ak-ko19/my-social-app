const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');
const blockService = require('../services/blockService');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql } = require('../services/reactionService');

// B6 profile tabs: GET /users/:id/posts?tab=posts|photos|tagged
//   posts  -- the user's own posts
//   photos -- the user's own posts that have at least one image
//   tagged -- OTHER people's posts that @mention the user. (Scope decision,
//             see ROADMAP B6: the app has text @mentions, not photo tags,
//             so "tagged" = mentioned.)
// Saved is the viewer's own GET /bookmarks, not served here.
//
// Every post still passes the same per-post visibility predicate as the
// discovery feed (account privacy + B5 post audience + blocks), so a tab
// can never show a post its viewer couldn't open directly.
const TABS = ['posts', 'photos', 'tagged'];

// A mention is "@" + the exact username, not preceded or followed by a
// word character -- the same boundaries mentionService's /@(\w+)/ uses.
// The username is regex-escaped (usernames aren't restricted to \w) and
// passed as a bound parameter.
function mentionPattern(username) {
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `(^|[^A-Za-z0-9_])@${escaped}([^A-Za-z0-9_]|$)`;
}

async function getUserPosts(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const tab = req.query.tab || 'posts';
    if (!TABS.includes(tab)) {
      return res.status(400).send(`tab must be one of: ${TABS.join(', ')}`);
    }
    const targetId = Number(req.params.id);
    const viewerId = req.userId ?? null;

    const target = await db.query(
      `SELECT id, username, is_private, is_deactivated,
         $2::int IS NOT NULL AND EXISTS(
           SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = users.id AND status = 'accepted'
         ) AS viewer_is_follower
       FROM users WHERE id = $1`,
      [targetId, viewerId]
    );
    const user = target.rows[0];
    const isSelf = viewerId !== null && viewerId === targetId;
    if (!user || (user.is_deactivated && !isSelf)) {
      return res.status(404).send('User not found');
    }
    if (!isSelf && viewerId !== null && (await blockService.isBlocked(viewerId, targetId))) {
      return res.status(404).send('User not found');
    }
    // Same as the follower lists: a private account's profile content is
    // for its accepted followers.
    if (user.is_private && !isSelf && !user.viewer_is_follower) {
      return res.status(403).send('This account is private');
    }

    const { page, limit, offset } = getPagination(req, { defaultLimit: 12, maxLimit: 50 });
    let tabCondition;
    const params = [viewerId, limit + 1, offset, targetId];
    if (tab === 'posts') {
      tabCondition = 'posts.user_id = $4 AND posts.page_id IS NULL'; // B14: page posts live on the page
    } else if (tab === 'photos') {
      tabCondition = 'posts.user_id = $4 AND posts.page_id IS NULL AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = posts.id)';
    } else {
      tabCondition = 'posts.user_id <> $4 AND posts.content ~* $5';
      params.push(mentionPattern(user.username));
    }

    const result = await db.query(`
      SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
        ${reactionColumnsSql('$1')},
        ${mediaColumnSql()},
        ${pageColumnSql()},
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me
      FROM posts
      JOIN users ON posts.user_id = users.id
      -- B13: community posts live in their community feed only.
      WHERE posts.community_id IS NULL AND ${tabCondition}
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
        AND (NOT users.is_deactivated OR users.id = $1)
      ORDER BY posts.created_at DESC
      LIMIT $2 OFFSET $3
    `, params);

    const hasMore = result.rows.length > limit;
    res.json({ posts: hasMore ? result.rows.slice(0, limit) : result.rows, currentPage: page, hasMore });
  } catch (err) {
    sendServerError(res, err, 'Loading profile posts failed. Please try again later.');
  }
}

module.exports = { getUserPosts, mentionPattern };
