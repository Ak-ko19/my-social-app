const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireConversationParticipant = require('../middleware/requireConversationParticipant');
const { uploadAudio, uploadToCloudinary } = require('../middleware/cloudinaryUpload');
const conversationController = require('../controllers/conversationController');

router.get('/conversations', authMiddleware, conversationController.getConversations);
router.post('/conversations', authMiddleware, conversationController.createConversation);
router.get('/conversations/:id/messages', authMiddleware, conversationController.getMessages);
router.post('/conversations/:id/messages', authMiddleware, conversationController.sendMessage);
router.post(
  '/conversations/:id/messages/voice',
  authMiddleware,
  requireConversationParticipant,
  uploadAudio.single('audio'),
  // format: 'mp3' -- see uploadToCloudinary's comment. Forces every voice
  // message to a universally-playable delivery format regardless of which
  // browser/OS recorded it (Chrome/Firefox send audio/webm, Safari sends
  // audio/mp4 -- neither is safely playable on every OTHER browser as-is).
  uploadToCloudinary('voice-messages', 'video', 'mp3'),
  conversationController.sendVoiceMessage
);
router.delete('/conversations/:id/messages/:messageId', authMiddleware, conversationController.deleteMessage);
router.put('/conversations/:id/read', authMiddleware, conversationController.markConversationRead);

module.exports = router;
