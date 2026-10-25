const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { upload, uploadToCloudinary } = require('../middleware/cloudinaryUpload');
const storiesController = require('../controllers/storiesController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// B3 Stories. All routes require login: stories are only ever shown to
// the author and their accepted followers (see storiesController).
router.post('/stories', authMiddleware, upload.single('image'), uploadToCloudinary('stories'), storiesController.createStory);
router.get('/stories', authMiddleware, storiesController.getStoriesTray);
router.post('/stories/:id/view', authMiddleware, storiesController.markStoryViewed);
router.delete('/stories/:id', authMiddleware, storiesController.deleteStory);

module.exports = router;
