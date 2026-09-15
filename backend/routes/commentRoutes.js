const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const commentController = require('../controllers/commentController');

router.post('/posts/:id/comments', authMiddleware, commentController.createComment);
router.get('/posts/:id/comments', commentController.getComments);
router.put('/comments/:id', authMiddleware, commentController.updateComment);
router.delete('/comments/:id', authMiddleware, commentController.deleteComment);

module.exports = router;
