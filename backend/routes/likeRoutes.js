const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const likeController = require('../controllers/likeController');

router.post('/posts/:id/like', authMiddleware, likeController.likePost);
router.delete('/posts/:id/like', authMiddleware, likeController.unlikePost);
router.get('/posts/:id/likes', likeController.getLikes);

module.exports = router;
