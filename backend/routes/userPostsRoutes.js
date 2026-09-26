const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const userPostsController = require('../controllers/userPostsController');

// B6 profile tabs (posts / photos / tagged). optionalAuth: a public
// profile's public posts are viewable logged out, same as GET /posts.
router.get('/users/:id/posts', optionalAuth, userPostsController.getUserPosts);

module.exports = router;
