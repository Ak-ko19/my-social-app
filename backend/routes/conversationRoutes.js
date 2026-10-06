const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireConversationParticipant = require('../middleware/requireConversationParticipant');
const { upload, uploadAudio, uploadToCloudinary } = require('../middleware/cloudinaryUpload');
const conversationController = require('../controllers/conversationController');
const groupController = require('../controllers/groupController');
const { messageReactionLimiter } = require('../middleware/rateLimiter');

router.get('/conversations', authMiddleware, conversationController.getConversations);
router.post('/conversations', authMiddleware, conversationController.createConversation);
// B10 group chat.
router.post('/conversations/groups', authMiddleware, groupController.createGroup);
router.get('/conversations/:id', authMiddleware, groupController.getConversationDetails);
router.patch('/conversations/:id', authMiddleware, groupController.renameGroup);
router.post('/conversations/:id/members', authMiddleware, groupController.addMembers);
router.delete('/conversations/:id/members/:userId', authMiddleware, groupController.removeMember);
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
// B9: image messages (participation checked before the upload happens).
router.post(
  '/conversations/:id/messages/image',
  authMiddleware,
  requireConversationParticipant,
  upload.single('image'),
  uploadToCloudinary('message-images'),
  conversationController.sendImageMessage
);
router.put('/conversations/:id/messages/:messageId', authMiddleware, conversationController.editMessage);
router.delete('/conversations/:id/messages/:messageId', authMiddleware, conversationController.deleteMessage);
router.put('/conversations/:id/read', authMiddleware, conversationController.markConversationRead);
router.put('/conversations/:id/mute', authMiddleware, conversationController.muteConversation);
// Day 31: react to a message (one reaction per person; DELETE removes it).
router.put('/conversations/:id/messages/:messageId/reaction', authMiddleware, messageReactionLimiter, conversationController.setMessageReaction);
router.delete('/conversations/:id/messages/:messageId/reaction', authMiddleware, messageReactionLimiter, conversationController.setMessageReaction);

module.exports = router;
