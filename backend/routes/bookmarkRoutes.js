const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const bookmarkController = require('../controllers/bookmarkController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

router.post('/posts/:id/bookmark', authMiddleware, bookmarkController.bookmarkPost);
router.delete('/posts/:id/bookmark', authMiddleware, bookmarkController.unbookmarkPost);
router.get('/bookmarks', authMiddleware, bookmarkController.getBookmarks);

module.exports = router;
