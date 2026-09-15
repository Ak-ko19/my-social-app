const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const messageController = require('../controllers/messageController');

router.post('/messages', authMiddleware, messageController.sendMessage);
router.get('/conversations', authMiddleware, messageController.getConversations);
router.get('/messages/:userId', authMiddleware, messageController.getConversation);
router.put('/messages/:userId/read', authMiddleware, messageController.markConversationRead);

module.exports = router;
