const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const { upload, uploadToCloudinary } = require('../middleware/cloudinaryUpload');
const postController = require('../controllers/postController');

router.post('/posts', authMiddleware, upload.single('image'), uploadToCloudinary('posts'), postController.createPost);
router.get('/posts', optionalAuth, postController.getPosts);
router.get('/feed', authMiddleware, postController.getFeed);
router.get('/posts/:id', optionalAuth, postController.getPost);
router.put('/posts/:id', authMiddleware, postController.updatePost);
router.delete('/posts/:id', authMiddleware, postController.deletePost);

module.exports = router;
