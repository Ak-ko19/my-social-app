const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const { followLimiter } = require('../middleware/rateLimiter');
const followController = require('../controllers/followController');

router.post('/users/:id/follow', authMiddleware, followLimiter, followController.followUser);
router.delete('/users/:id/follow', authMiddleware, followController.unfollowUser);
router.get('/users/:id/followers', optionalAuth, followController.getFollowers);
router.get('/users/:id/following', optionalAuth, followController.getFollowing);
router.get('/users/:id/follow-counts', followController.getFollowCounts);

router.get('/follow-requests', authMiddleware, followController.getFollowRequests);
router.post('/follow-requests/:followerId/approve', authMiddleware, followController.approveFollowRequest);
router.delete('/follow-requests/:followerId', authMiddleware, followController.denyFollowRequest);

module.exports = router;
