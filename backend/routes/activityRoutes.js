const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const activityController = require('../controllers/activityController');

// Day 48: your activity log.
router.get('/activity/likes', authMiddleware, activityController.getLikes);
router.get('/activity/comments', authMiddleware, activityController.getComments);

module.exports = router;
