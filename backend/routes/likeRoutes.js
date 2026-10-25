const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const likeController = require('../controllers/likeController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

router.post('/posts/:id/like', authMiddleware, likeController.likePost);
router.delete('/posts/:id/like', authMiddleware, likeController.unlikePost);
router.put('/posts/:id/reaction', authMiddleware, likeController.setReaction);
router.get('/posts/:id/likes', optionalAuth, likeController.getLikes);

module.exports = router;
