const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const c = require('../controllers/collectionController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// Day 46: saved collections. All private to their owner.
router.get('/collections', authMiddleware, c.listCollections);
router.post('/collections', authMiddleware, c.createCollection);
router.patch('/collections/:id', authMiddleware, c.renameCollection);
router.delete('/collections/:id', authMiddleware, c.deleteCollection);
router.get('/collections/:id/posts', authMiddleware, c.collectionPosts);
router.get('/posts/:id/collections', authMiddleware, c.postCollections);
router.put('/posts/:id/collections', authMiddleware, c.setPostCollections);

module.exports = router;
