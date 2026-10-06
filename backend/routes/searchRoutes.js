const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const authMiddleware = require('../middleware/authMiddleware');
const searchController = require('../controllers/searchController');
const searchHistoryController = require('../controllers/searchHistoryController');

router.get('/search/users', optionalAuth, searchController.searchUsers);
router.get('/search/posts', optionalAuth, searchController.searchPosts);
router.get('/search/hashtags', optionalAuth, searchController.searchHashtags);

// Day 42: recent searches, the signed-in person's own.
router.get('/search/history', authMiddleware, searchHistoryController.getSearchHistory);
router.post('/search/history', authMiddleware, searchHistoryController.saveSearch);
router.delete('/search/history', authMiddleware, searchHistoryController.clearSearchHistory);
router.delete('/search/history/:id', authMiddleware, searchHistoryController.deleteSearch);

module.exports = router;
