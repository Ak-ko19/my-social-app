const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const { followLimiter } = require('../middleware/rateLimiter');
const followController = require('../controllers/followController');

router.post('/users/:id/follow', authMiddleware, followLimiter, followController.followUser);
router.delete('/users/:id/follow', authMiddleware, followController.unfollowUser);
router.get('/users/:id/follow-counts', followController.getFollowCounts);
// Day 37: friends (mutual follows), followers and following, one page at a time.
router.get('/users/:id/connections', optionalAuth, followController.getConnections);
router.get('/users/:id/mutual-friends', optionalAuth, followController.getMutualFriends);

router.get('/follow-requests', authMiddleware, followController.getFollowRequests);
router.post('/follow-requests/:followerId/approve', authMiddleware, followController.approveFollowRequest);
router.delete('/follow-requests/:followerId', authMiddleware, followController.denyFollowRequest);

module.exports = router;
