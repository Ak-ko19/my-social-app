const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const searchController = require('../controllers/searchController');

router.get('/search/users', optionalAuth, searchController.searchUsers);
router.get('/search/posts', optionalAuth, searchController.searchPosts);
router.get('/search/hashtags', optionalAuth, searchController.searchHashtags);

module.exports = router;
