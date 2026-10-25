const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const userPostsController = require('../controllers/userPostsController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// B6 profile tabs (posts / photos / tagged). optionalAuth: a public
// profile's public posts are viewable logged out, same as GET /posts.
router.get('/users/:id/posts', optionalAuth, userPostsController.getUserPosts);

module.exports = router;
