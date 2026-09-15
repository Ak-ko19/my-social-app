const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const followController = require('../controllers/followController');

router.post('/users/:id/follow', authMiddleware, followController.followUser);
router.delete('/users/:id/follow', authMiddleware, followController.unfollowUser);
router.get('/users/:id/followers', followController.getFollowers);
router.get('/users/:id/following', followController.getFollowing);
router.get('/users/:id/follow-counts', followController.getFollowCounts);

module.exports = router;
