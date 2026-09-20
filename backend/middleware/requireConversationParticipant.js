const messageService = require('../services/messageService');

// Gates conversation-scoped upload routes (currently just the voice-message
// endpoint) on participation BEFORE any multer parsing or Cloudinary upload
// happens -- unlike a plain text send, an audio upload is expensive (network
// transfer + Cloudinary processing), so a non-participant must be rejected
// up front rather than after paying for that work. Uses the exact same
// isParticipant check every other message write path re-verifies against
// conversation_participants (see messageService's own comment on why room
// membership alone is never trusted).
async function requireConversationParticipant(req, res, next) {
  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) {
    return res.status(400).send('Invalid conversation ID');
  }

  try {
    if (!(await messageService.isParticipant(conversationId, req.userId))) {
      return res.status(403).send('You are not a participant in this conversation');
    }
    next();
  } catch (err) {
    console.error('requireConversationParticipant failed:', err.message);
    res.status(500).send('Failed to verify conversation membership. Please try again later.');
  }
}

module.exports = requireConversationParticipant;
