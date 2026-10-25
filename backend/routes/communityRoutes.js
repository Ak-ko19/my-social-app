const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const c = require('../controllers/communityController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// B13 Groups. Reading a public group works logged out (optionalAuth);
// everything that changes membership or settings needs a login.
router.post('/communities', authMiddleware, c.createCommunity);
router.get('/communities', authMiddleware, c.listCommunities);
router.get('/communities/:id', optionalAuth, c.getCommunity);
router.patch('/communities/:id', authMiddleware, c.updateCommunity);
router.delete('/communities/:id', authMiddleware, c.deleteCommunity); // Day 50
router.get('/communities/:id/posts', optionalAuth, c.listPosts);
router.get('/communities/:id/members', optionalAuth, c.listMembers);
router.post('/communities/:id/join', authMiddleware, c.joinCommunity);
router.delete('/communities/:id/members/:userId', authMiddleware, c.removeMember);
router.put('/communities/:id/members/:userId/role', authMiddleware, c.setRole);
router.get('/communities/:id/requests', authMiddleware, c.listRequests);
router.post('/communities/:id/requests/:userId/approve', authMiddleware, c.approveRequest);
// Day 50: Remove and ban.
router.get('/communities/:id/bans', authMiddleware, c.listBans);
router.post('/communities/:id/bans/:userId', authMiddleware, c.banMember);
router.delete('/communities/:id/bans/:userId', authMiddleware, c.unbanMember);

module.exports = router;
