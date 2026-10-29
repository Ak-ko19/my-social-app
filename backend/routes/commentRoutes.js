const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const commentController = require('../controllers/commentController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

router.post('/posts/:id/comments', authMiddleware, commentController.createComment);
router.get('/posts/:id/comments', optionalAuth, commentController.getComments);
// Days 109-110: a comment's replies, a page at a time.
router.get('/comments/:id/replies', optionalAuth, commentController.getReplies);
router.put('/comments/:id', authMiddleware, commentController.updateComment);
router.delete('/comments/:id', authMiddleware, commentController.deleteComment);
router.post('/comments/:id/like', authMiddleware, commentController.likeComment);
router.delete('/comments/:id/like', authMiddleware, commentController.unlikeComment);
// Day 47: the post's owner approves a restricted person's comment.
router.post('/comments/:id/approve', authMiddleware, commentController.approveComment);

module.exports = router;
