const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');
const blockService = require('../services/blockService');

async function bookmarkPost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const postCheck = await db.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    if (await blockService.isBlocked(req.userId, postCheck.rows[0].user_id)) {
      return res.status(404).send('Post not found');
    }

    await db.query('INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)', [req.userId, req.params.id]);
    res.status(201).send('Post bookmarked successfully');
  } catch (err) {
    // Same reasoning as likeController.likePost: bookmarks has a
    // UNIQUE(user_id, post_id) constraint that can catch a concurrent
    // request that raced past the check the frontend's optimistic toggle
    // already prevents in the common case.
    if (err.code === '23505') {
      return res.status(400).send('You have already bookmarked this post');
    }
    sendServerError(res, err, 'Bookmark failed. Please try again later.');
  }
}

async function unbookmarkPost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const result = await db.query(
      'DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2 RETURNING *',
      [req.userId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('You have not bookmarked this post');
    }
    res.send('Post unbookmarked successfully');
  } catch (err) {
    sendServerError(res, err, 'Unbookmark failed. Please try again later.');
  }
}

async function getBookmarks(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });

    // Same "fetch one extra row" no-COUNT(*) trick as getPosts/getFeed, plus
    // the same block-filtering as getFeed -- a saved post from someone you
    // later blocked (or who blocked you) shouldn't keep showing up here.
    const result = await db.query(`
      SELECT posts.id, posts.content, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
        bookmarks.created_at AS bookmarked_at,
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
        EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
        true AS bookmarked_by_me
      FROM bookmarks
      JOIN posts ON posts.id = bookmarks.post_id
      JOIN users ON users.id = posts.user_id
      WHERE bookmarks.user_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocks.blocker_id = $1 AND blocks.blocked_id = posts.user_id)
             OR (blocks.blocker_id = posts.user_id AND blocks.blocked_id = $1)
        )
        AND (
          NOT users.is_private
          OR users.id = $1
          OR EXISTS (SELECT 1 FROM follows WHERE follows.follower_id = $1 AND follows.following_id = users.id AND follows.status = 'accepted')
        )
        AND NOT users.is_deactivated
      ORDER BY bookmarks.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.userId, limit + 1, offset]);

    const hasMore = result.rows.length > limit;
    const posts = hasMore ? result.rows.slice(0, limit) : result.rows;

    res.json({ page, posts, hasMore });
  } catch (err) {
    sendServerError(res, err, 'Fetch bookmarks failed. Please try again later.');
  }
}

module.exports = { bookmarkPost, unbookmarkPost, getBookmarks };
