const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

router.get('/search/users', searchController.searchUsers);
router.get('/search/posts', searchController.searchPosts);

module.exports = router;
