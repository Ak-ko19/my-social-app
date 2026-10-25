const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const c = require('../controllers/closeFriendsController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// Day 47: your close friends list.
router.get('/close-friends', authMiddleware, c.listCloseFriends);
router.get('/close-friends/candidates', authMiddleware, c.listCandidates);
router.put('/close-friends/:id', authMiddleware, c.addCloseFriend);
router.delete('/close-friends/:id', authMiddleware, c.removeCloseFriend);

module.exports = router;
