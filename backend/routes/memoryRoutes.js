const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const memoryController = require('../controllers/memoryController');

const router = express.Router();

// Days 83-84: Memories -- your posts from this day in earlier years.
router.get('/memories', authMiddleware, memoryController.getMemories);

module.exports = router;
