const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const exploreController = require('../controllers/exploreController');

// B7 Explore. optionalAuth: works logged out (public content only); a
// logged-in viewer also gets their follows' posts and block filtering.
router.get('/explore/hashtags', optionalAuth, exploreController.getTrendingHashtags);
router.get('/explore/posts', optionalAuth, exploreController.getPopularPosts);

module.exports = router;
