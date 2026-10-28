const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const authMiddleware = require('../middleware/authMiddleware');
const hashtagController = require('../controllers/hashtagController');

router.get('/hashtags/:tag/posts', optionalAuth, hashtagController.getPostsByHashtag);
// Days 107-108: following a hashtag.
router.get('/hashtags/:tag', optionalAuth, hashtagController.getHashtag);
router.put('/hashtags/:tag/follow', authMiddleware, hashtagController.followHashtag);
router.delete('/hashtags/:tag/follow', authMiddleware, hashtagController.unfollowHashtag);
router.get('/followed-hashtags', authMiddleware, hashtagController.listFollowedHashtags);

module.exports = router;
