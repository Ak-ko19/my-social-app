const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const postController = require('../controllers/postController');

router.post('/posts', authMiddleware, upload.single('image'), upload.validateImageContent, postController.createPost);
router.get('/posts', postController.getPosts);
router.get('/feed', authMiddleware, postController.getFeed);
router.get('/posts/:id', postController.getPost);
router.put('/posts/:id', authMiddleware, postController.updatePost);
router.delete('/posts/:id', authMiddleware, postController.deletePost);

module.exports = router;
