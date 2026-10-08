const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const muteController = require('../controllers/muteController');

// Day 47: muted people.
router.post('/users/:id/mute', authMiddleware, muteController.muteUser);
router.delete('/users/:id/mute', authMiddleware, muteController.unmuteUser);
router.get('/muted-users', authMiddleware, muteController.getMutedUsers);

module.exports = router;
