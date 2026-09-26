const db = require('../db');
const { reactionColumnsSql, mediaColumnSql } = require('../services/reactionService');

// B5: keep in sync with migration 020's CHECK constraint.
const POST_VISIBILITIES = ['public', 'followers'];
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');
const blockService = require('../services/blockService');
const hashtagService = require('../services/hashtagService');
const mentionService = require('../services/mentionService');

async function createPost(req, res) {
  try {
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).send('Post content cannot be empty');
    }
    // B5: audience -- 'public' unless the client asks for 'followers'.
    const visibility = req.body.visibility || 'public';
    if (!POST_VISIBILITIES.includes(visibility)) {
      return res.status(400).send(`visibility must be one of: ${POST_VISIBILITIES.join(', ')}`);
    }
    // B2: every uploaded image, in the order sent (see uploadManyToCloudinary).
    const imageUrls = (req.cloudinaryResults || []).map((r) => r.secure_url);
    // One statement inserts the post AND its post_media rows, so a post can
    // never exist with only some of its images. posts.image_url mirrors the
    // first image for older readers (see migration 017).
    const result = await db.query(
      `WITH new_post AS (
         INSERT INTO posts (user_id, content, image_url, visibility) VALUES ($1, $2, $3, $5) RETURNING *
       ), new_media AS (
         INSERT INTO post_media (post_id, url, position)
         SELECT new_post.id, m.url, (m.ord - 1)::smallint
         FROM new_post, unnest($4::text[]) WITH ORDINALITY AS m(url, ord)
       )
       SELECT * FROM new_post`,
      [req.userId, content, imageUrls[0] || null, imageUrls, visibility]
    );
    const post = { ...result.rows[0], media: imageUrls.map((url) => ({ url })) };
    await hashtagService.syncPostHashtags(post.id, content);
    await mentionService.notifyMentions({ content, authorId: req.userId, postId: post.id });
    res.status(201).json(post);
  } catch (err) {
    sendServerError(res, err, 'Create post failed. Please try again later.');
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
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE ($1::int IS NULL OR NOT EXISTS (
        SELECT 1 FROM blocks
        WHERE (blocks.blocker_id = $1 AND blocks.blocked_id = posts.user_id)
           OR (blocks.blocker_id = posts.user_id AND blocks.blocked_id = $1)
      ))
      AND (
        (NOT users.is_private AND posts.visibility = 'public')
        OR users.id = $1
        OR EXISTS (SELECT 1 FROM follows WHERE follows.follower_id = $1 AND follows.following_id = users.id AND follows.status = 'accepted')
      )
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
    sendServerError(res, err, 'Fetch posts failed. Please try again later.');
  }
}

async function getFeed(req, res) {
  try {
    const userId = req.userId;
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });

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
        EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me,
        EXISTS(SELECT 1 FROM follows WHERE follows.follower_id = $1 AND follows.following_id = posts.user_id AND follows.status = 'accepted') AS is_following
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = $1 AND status = 'accepted'
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks
        WHERE (blocks.blocker_id = $1 AND blocks.blocked_id = posts.user_id)
           OR (blocks.blocker_id = posts.user_id AND blocks.blocked_id = $1)
      )
      AND NOT users.is_deactivated
      ORDER BY posts.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    // Same "fetch one extra row" trick as getPosts -- avoids a separate
    // COUNT(*) just to know whether another page exists.
    const result = await db.query(feedQuery, [userId, limit + 1, offset]);

    const hasMore = result.rows.length > limit;
    const posts = hasMore ? result.rows.slice(0, limit) : result.rows;

    res.status(200).json({
      page,
      limit,
      posts,
      hasMore
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
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
        (SELECT COUNT(*)::int FROM comments WHERE comments.post_id = posts.id) AS comment_count,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
        ${reactionColumnsSql('$1')},
        ${mediaColumnSql()},
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
    // A deactivated account's posts are hidden from everyone but the owner
    // themselves -- same treatment as a block/private-account gate below.
    if (post.author_is_deactivated && viewerId !== post.user_id) {
      return res.status(404).send('Post not found');
    }
    // Mutual invisibility: don't reveal a blocked post even exists.
    if (viewerId && (await blockService.isBlocked(viewerId, post.user_id))) {
      return res.status(404).send('Post not found');
    }
    // A private account's post is only visible to the author themselves or
    // an accepted follower -- same "not found" (not 403) treatment as the
    // block check above, so a direct-link/share doesn't leak that a
    // private post exists at all to someone who can't see it.
    // B5: a followers-only post gets the same gate even on a public account.
    const followersOnly = post.author_is_private || post.visibility === 'followers';
    if (followersOnly && viewerId !== post.user_id && !post.viewer_is_follower) {
      return res.status(404).send('Post not found');
    }

    res.json(post);
  } catch (err) {
    sendServerError(res, err, 'Fetch post failed. Please try again later.');
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
    const { content, visibility } = req.body;
    if (content === undefined && visibility === undefined) {
      return res.status(400).send('Nothing to update');
    }
    if (content !== undefined && (typeof content !== 'string' || content.trim() === '')) {
      return res.status(400).send('Post content cannot be empty');
    }
    if (visibility !== undefined && !POST_VISIBILITIES.includes(visibility)) {
      return res.status(400).send(`visibility must be one of: ${POST_VISIBILITIES.join(', ')}`);
    }
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    if (postCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only edit your own posts');
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
    sendServerError(res, err, 'Update post failed. Please try again later.');
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
    if (postCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only delete your own posts');
    }
    await db.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.send('Post deleted successfully');
  } catch (err) {
    sendServerError(res, err, 'Delete post failed. Please try again later.');
  }
}

module.exports = { createPost, getPosts, getFeed, getPost, updatePost, deletePost };
