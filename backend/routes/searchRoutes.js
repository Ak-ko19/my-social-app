const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const searchController = require('../controllers/searchController');

router.get('/search/users', optionalAuth, searchController.searchUsers);
router.get('/search/posts', optionalAuth, searchController.searchPosts);

module.exports = router;
