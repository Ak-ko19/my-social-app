const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const conversationController = require('../controllers/conversationController');

router.get('/conversations', authMiddleware, conversationController.getConversations);
router.post('/conversations', authMiddleware, conversationController.createConversation);
router.get('/conversations/:id/messages', authMiddleware, conversationController.getMessages);
router.post('/conversations/:id/messages', authMiddleware, conversationController.sendMessage);
router.put('/conversations/:id/read', authMiddleware, conversationController.markConversationRead);

module.exports = router;
