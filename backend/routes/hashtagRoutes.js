const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const hashtagController = require('../controllers/hashtagController');

router.get('/hashtags/:tag/posts', optionalAuth, hashtagController.getPostsByHashtag);

module.exports = router;
