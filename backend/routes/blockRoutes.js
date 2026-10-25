const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const blockController = require('../controllers/blockController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

router.post('/users/:id/block', authMiddleware, blockController.blockUser);
router.delete('/users/:id/block', authMiddleware, blockController.unblockUser);
router.get('/blocked-users', authMiddleware, blockController.getBlockedUsers);

module.exports = router;
