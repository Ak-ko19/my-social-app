const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const hiddenWordsController = require('../controllers/hiddenWordsController');

// Day 49: your hidden words.
router.get('/hidden-words', authMiddleware, hiddenWordsController.getHiddenWords);
router.put('/hidden-words/mode', authMiddleware, hiddenWordsController.setMode);
router.post('/hidden-words', authMiddleware, hiddenWordsController.addWord);
router.delete('/hidden-words/:word', authMiddleware, hiddenWordsController.removeWord);

module.exports = router;
