const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const { uploadPostImages, uploadManyToCloudinary } = require('../middleware/cloudinaryUpload');
const postController = require('../controllers/postController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

router.post('/posts', authMiddleware, uploadPostImages, uploadManyToCloudinary('posts'), postController.createPost);
router.get('/posts', optionalAuth, postController.getPosts);
router.get('/feed', authMiddleware, postController.getFeed);
router.get('/posts/:id', optionalAuth, postController.getPost);
router.put('/posts/:id', authMiddleware, postController.updatePost);
// Days 93-94: share to your own feed.
router.post('/posts/:id/share', authMiddleware, postController.sharePost);
// Day 44: vote in a poll post.
router.post('/posts/:id/poll/vote', authMiddleware, postController.votePoll);
router.delete('/posts/:id', authMiddleware, postController.deletePost);

module.exports = router;
