const db = require('../db');
const { noBlockBetweenSql } = require('../services/blockService');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql, commentCountColumnSql } = require('../services/reactionService');

const { sendError } = require('../utils/httpError');
const { mediaOfPost, deleteMedia } = require('../services/mediaCleanupService');
const { getPagination } = require('../utils/pagination');
const { encodeCursor, decodeCursor } = require('../utils/cursorPagination');
const { getVisiblePost, postAudienceSql } = require('../services/postVisibilityService');
const hashtagService = require('../services/hashtagService');
const { toUnicode } = require('../utils/myanmarText');
const pollService = require('../services/pollService');
const postCreation = require('../services/postCreationService');
const { notMutedSql } = require('../services/muteService');
const spamService = require('../services/spamService');
const { managesPage } = require('../services/pageAdminService');
const shareService = require('../services/shareService');

const { POST_VISIBILITIES, MAX_POST_LENGTH } = postCreation;

async function createPost(req, res) {
  try {
    // Day 45: the checks and the insert live in postCreationService, shared
    // with publishing a draft or scheduled post.
    const fields = postCreation.readPostFields(req.body);
    // B2: every uploaded image, in the order sent (see uploadManyToCloudinary).
    // (A refused request's images are deleted again by the middleware.)
    const imageUrls = (req.cloudinaryResults || []).map((r) => r.secure_url);
    // Day 49: flooding, the same post again, the same link again and again.
    await spamService.checkPost(req.userId, fields.content);
    res.status(201).json(await postCreation.createPost(req.userId, fields, imageUrls));
  } catch (err) {
    sendError(res, err, 'Create post failed. Please try again later.');
  }
}

async function getPosts(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });

    // req.userId is only set when a valid token was sent (optionalAuth) --
    // an anonymous request has no block relationships to filter, so the
    // NOT EXISTS below is written to always be true ($1 IS NULL) in that case
    // rather than needing a second query shape.
    const viewerId = req.userId ?? null;

    // Fetch one extra row instead of running a separate COUNT(*) -- a
    // full-table count gets slower as the table grows and every request
    // was paying for it. hasMore is all a feed UI actually needs.
    const result = await db.query(`
      SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
        ${reactionColumnsSql('$1')},
        ${mediaColumnSql()},
        ${pollService.pollColumnSql('$1')},
        ${commentCountColumnSql('$1')},
        ${shareService.shareColumnsSql('$1')},
        ${pageColumnSql()},
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me
      FROM posts
      JOIN users ON posts.user_id = users.id
      -- B13: community posts live in their community feed only.
      WHERE posts.community_id IS NULL AND ($1::int IS NULL OR ${noBlockBetweenSql('$1', 'posts.user_id')})
      AND ${postAudienceSql('$1')}
      AND NOT users.is_deactivated
      ORDER BY posts.created_at DESC
      LIMIT $2 OFFSET $3
    `, [viewerId, limit + 1, offset]);

    const hasMore = result.rows.length > limit;
    const posts = hasMore ? result.rows.slice(0, limit) : result.rows;

    res.json({
      posts,
      currentPage: page,
      hasMore
    });
  } catch (err) {
    sendError(res, err, 'Fetch posts failed. Please try again later.');
  }
}

async function getFeed(req, res) {
  try {
    const userId = req.userId;
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });
    // Day 74: ?cursor= (the nextCursor of the page before) resumes right
    // after that page's last post -- a deep page then reads only its own
    // rows, where ?page= (still accepted) has to walk past every earlier one.
    let cursor;
    try {
      cursor = decodeCursor(req.query.cursor);
    } catch (err) {
      return res.status(400).send('Invalid cursor');
    }

    // like_count/liked_by_me/is_following are correlated subqueries rather
    // than a JOIN+GROUP BY -- simpler to keep correct alongside SELECT
    // posts.* and cheap given per-post like/follow rows are small. $1 (userId)
    // is reused from the WHERE clause below, not a new bound parameter.
    const feedQuery = `
      SELECT posts.*, users.username, users.avatar_url,
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
        EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
        ${reactionColumnsSql('$1')},
        ${mediaColumnSql()},
        ${pollService.pollColumnSql('$1')},
        ${commentCountColumnSql('$1')},
        ${shareService.shareColumnsSql('$1')},
        ${pageColumnSql()},
        EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me,
        EXISTS(SELECT 1 FROM follows WHERE follows.follower_id = $1 AND follows.following_id = posts.user_id AND follows.status = 'accepted') AS is_following
      FROM posts
      JOIN users ON posts.user_id = users.id
      -- B13: community posts live in their community feed only.
      WHERE posts.community_id IS NULL AND (
        -- Your own posts, so a new post is at the top of Home right away
        -- (every audience: you can always see your own).
        (posts.page_id IS NULL AND posts.user_id = $1)
        OR (posts.page_id IS NULL AND posts.visibility IN ('public', 'followers') AND posts.user_id IN (
          SELECT following_id FROM follows WHERE follower_id = $1 AND status = 'accepted'
        ))
        -- Day 47: close-friends posts of people you follow who listed you.
        OR (posts.page_id IS NULL AND posts.visibility = 'close_friends' AND posts.user_id IN (
          SELECT following_id FROM follows WHERE follower_id = $1 AND status = 'accepted'
        ) AND EXISTS (SELECT 1 FROM close_friends cf WHERE cf.user_id = posts.user_id AND cf.friend_id = $1))
        -- B14: posts from pages you follow.
        OR posts.page_id IN (SELECT page_id FROM page_follows WHERE user_id = $1)
      )
      AND ${noBlockBetweenSql('$1', 'posts.user_id')}
      AND NOT users.is_deactivated
      -- Day 47: not from people you muted (your own posts are never muted).
      AND ${notMutedSql('$1', 'posts.user_id', 'posts.page_id')}
      -- Day 74: after the cursor's post, by its own stored (created_at, id),
      -- microseconds included. Kept a plain row comparison so Postgres
      -- starts the created_at index scan right there (wrapped in a CASE it
      -- became a filter, walking every newer post like OFFSET). If that post
      -- was deleted meanwhile, the next one by id marks the place (ids grow
      -- with time; at worst a post the client already has comes again, and
      -- it de-dupes). None newer at all: every post left is older.
      AND ($4::int IS NULL OR (posts.created_at, posts.id) < (
        SELECT b.created_at, b.id FROM (
          (SELECT c.created_at, c.id FROM posts c WHERE c.id >= $4 ORDER BY c.id LIMIT 1)
          UNION ALL SELECT 'infinity', 0
        ) b ORDER BY b.created_at LIMIT 1
      ))
      -- id breaks created_at ties (e.g. rows from one transaction) so pages
      -- never overlap or skip a post.
      ORDER BY posts.created_at DESC, posts.id DESC
      LIMIT $2 OFFSET $3
    `;

    // Same "fetch one extra row" trick as getPosts -- avoids a separate
    // COUNT(*) just to know whether another page exists.
    const result = await db.query(feedQuery, [userId, limit + 1, cursor ? 0 : offset, cursor?.id ?? null]);

    const hasMore = result.rows.length > limit;
    const posts = hasMore ? result.rows.slice(0, limit) : result.rows;

    res.status(200).json({
      page,
      limit,
      posts,
      hasMore,
      nextCursor: hasMore ? encodeCursor({ id: posts[posts.length - 1].id }) : null
    });
  } catch (error) {
    sendError(res, error, 'Loading the feed failed. Please try again later.');
  }
}

async function getPost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const viewerId = req.userId ?? null;
    const result = await db.query(`
      SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
        users.is_private AS author_is_private,
        users.is_deactivated AS author_is_deactivated,
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
        -- Day 47: comments waiting for approval count only for the people who
        -- can see them (their author, the post's owner) -- so the count never
        -- gives a restriction away.
        (SELECT COUNT(*)::int FROM comments WHERE comments.post_id = posts.id
          AND (NOT comments.awaiting_approval OR comments.user_id = $1 OR posts.user_id = $1)) AS comment_count,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
        ${reactionColumnsSql('$1')},
        ${mediaColumnSql()},
        ${pollService.pollColumnSql('$1')},
        ${commentCountColumnSql('$1')},
        ${shareService.shareColumnsSql('$1')},
        ${pageColumnSql()},
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM follows WHERE follows.follower_id = $1 AND follows.following_id = users.id AND follows.status = 'accepted') AS viewer_is_follower
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = $2
    `, [viewerId, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Post not found');
    }

    const post = result.rows[0];
    // Every visibility rule (deactivated/banned author, blocks, private
    // account / followers-only audience, B13 community privacy) lives in
    // postVisibilityService -- the same check likes, comments and bookmarks
    // use, so the post page can never disagree with them. Hidden -> 404
    // (not 403), so a direct link doesn't confirm the post exists.
    const visible = await getVisiblePost(post.id, viewerId);
    if (!visible) {
      return res.status(404).send('Post not found');
    }

    // Day 50: a group post seen by someone not in the group is read-only
    // for them (communityService.assertCanInteract); the page shows it so.
    res.json({
      ...post,
      community_id: visible.community_id,
      group_locked: Boolean(visible.community_id && !visible.viewer_is_community_member)
    });
  } catch (err) {
    sendError(res, err, 'Fetch post failed. Please try again later.');
  }
}

async function updatePost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    // Either field may be sent on its own (B5 lets you change just the
    // audience). Previously a missing/empty `content` reached the NOT NULL
    // column and came back as a 500.
    const { content: typed, visibility } = req.body;
    if (typed === undefined && visibility === undefined) {
      return res.status(400).send('Nothing to update');
    }
    if (typed !== undefined && typeof typed !== 'string') {
      return res.status(400).send('Post content cannot be empty');
    }
    if (typed !== undefined && typed.length > MAX_POST_LENGTH) {
      return res.status(400).send(`Post must be ${MAX_POST_LENGTH} characters or fewer`);
    }
    // Day 43: Zawgyi Myanmar text is stored as Unicode (utils/myanmarText).
    const content = toUnicode(typed);
    if (visibility !== undefined && !POST_VISIBILITIES.includes(visibility)) {
      return res.status(400).send(`visibility must be one of: ${POST_VISIBILITIES.join(', ')}`);
    }
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    // Day 53: a page's posts belong to the page -- its admins edit them too.
    if (postCheck.rows[0].user_id !== req.userId && !(await managesPage(postCheck.rows[0].page_id, req.userId))) {
      return res.status(403).send('You can only edit your own posts');
    }
    // Days 93-94: a share may have no words of its own; any other post must.
    if (typed !== undefined && typed.trim() === '' && !postCheck.rows[0].is_share) {
      return res.status(400).send('Post content cannot be empty');
    }
    if (visibility !== undefined && (postCheck.rows[0].community_id || postCheck.rows[0].page_id)) {
      return res.status(400).send("Group and page posts don't have their own audience");
    }
    const result = await db.query(
      'UPDATE posts SET content = COALESCE($1, content), visibility = COALESCE($2, visibility) WHERE id = $3 RETURNING *',
      [content ?? null, visibility ?? null, req.params.id]
    );
    if (content !== undefined) {
      await hashtagService.syncPostHashtags(req.params.id, content);
    }
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Update post failed. Please try again later.');
  }
}

// Days 93-94: POST /posts/:id/share { content?, visibility? } -- share it
// to your own feed (shareService has the rules).
async function sharePost(req, res) {
  try {
    const content = req.body.content === undefined ? '' : req.body.content;
    // Day 49: a share is a post -- the same flood and link checks.
    if (typeof content === 'string') await spamService.checkPost(req.userId, content);
    res.status(201).json(await shareService.share(req.userId, Number(req.params.id), { content, visibility: req.body.visibility }));
  } catch (err) {
    sendError(res, err, 'Sharing failed. Please try again later.');
  }
}

async function deletePost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    const target = postCheck.rows[0];
    if (target.user_id !== req.userId) {
      // B13: community admins can remove any post in their community.
      let isCommunityAdmin = false;
      if (target.community_id) {
        const admin = await db.query(
          "SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2 AND role = 'admin' AND status = 'member'",
          [target.community_id, req.userId]
        );
        isCommunityAdmin = admin.rows.length > 0;
      }
      // Day 53: a page's admins remove any of its posts.
      if (!isCommunityAdmin && !(await managesPage(target.page_id, req.userId))) {
        return res.status(403).send('You can only delete your own posts');
      }
    }
    const media = await mediaOfPost(target.id);
    await db.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    deleteMedia(media); // not awaited: see mediaCleanupService
    res.send('Post deleted successfully');
  } catch (err) {
    sendError(res, err, 'Delete post failed. Please try again later.');
  }
}

// POST /posts/:id/poll/vote { optionId } -- Day 44. Anyone who can see the
// post can vote, once. Returns the poll with its results (201; 200 when
// it repeats the vote already cast, e.g. a double tap).
async function votePoll(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    // Same visibility rules as GET /posts/:id (blocks, private accounts,
    // groups) -- 404 so a hidden post's poll isn't confirmed to exist.
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
      return res.status(404).send('Post not found');
    }
    const { created, poll } = await pollService.vote(post.id, req.userId, req.body?.optionId);
    res.status(created ? 201 : 200).json(poll);
  } catch (err) {
    sendError(res, err, 'Voting failed. Please try again later.');
  }
}

module.exports = { createPost, getPosts, getFeed, getPost, updatePost, sharePost, deletePost, votePoll };
