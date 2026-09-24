const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const likeController = require('../controllers/likeController');

router.post('/posts/:id/like', authMiddleware, likeController.likePost);
router.delete('/posts/:id/like', authMiddleware, likeController.unlikePost);
router.get('/posts/:id/likes', optionalAuth, likeController.getLikes);

module.exports = router;
