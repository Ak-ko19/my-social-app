const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const muteController = require('../controllers/muteController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// Day 47: muted people.
router.post('/users/:id/mute', authMiddleware, muteController.muteUser);
router.delete('/users/:id/mute', authMiddleware, muteController.unmuteUser);
router.get('/muted-users', authMiddleware, muteController.getMutedUsers);

module.exports = router;
