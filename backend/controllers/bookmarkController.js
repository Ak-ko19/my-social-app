const db = require('../db');
const { sendError } = require('../utils/httpError');
const { getPagination } = require('../utils/pagination');
const { getVisiblePost } = require('../services/postVisibilityService');
const { listSaved } = require('../services/savedPostsService');

async function bookmarkPost(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    // Same visibility rules as GET /posts/:id -- see postVisibilityService.
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
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
    sendError(res, err, 'Bookmark failed. Please try again later.');
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
    sendError(res, err, 'Unbookmark failed. Please try again later.');
  }
}

async function getBookmarks(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });
    // Day 46: the query (and its visibility rules) is shared with a
    // collection's posts -- services/savedPostsService.
    const { posts, hasMore } = await listSaved(req.userId, { limit, offset });
    res.json({ page, posts, hasMore });
  } catch (err) {
    sendError(res, err, 'Fetch bookmarks failed. Please try again later.');
  }
}

module.exports = { bookmarkPost, unbookmarkPost, getBookmarks };
