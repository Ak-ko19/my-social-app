const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const commentController = require('../controllers/commentController');

router.post('/posts/:id/comments', authMiddleware, commentController.createComment);
router.get('/posts/:id/comments', optionalAuth, commentController.getComments);
router.put('/comments/:id', authMiddleware, commentController.updateComment);
router.delete('/comments/:id', authMiddleware, commentController.deleteComment);
router.post('/comments/:id/like', authMiddleware, commentController.likeComment);
router.delete('/comments/:id/like', authMiddleware, commentController.unlikeComment);

module.exports = router;
