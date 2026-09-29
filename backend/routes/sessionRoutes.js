const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const sessionController = require('../controllers/sessionController');

const router = express.Router();

// Day 8: sessions (see services/sessionService.js).
router.get('/sessions', authMiddleware, sessionController.getSessions);
router.post('/sessions/revoke-others', authMiddleware, sessionController.revokeOthers);
router.delete('/sessions/:id', authMiddleware, sessionController.deleteSession);
router.post('/logout', authMiddleware, sessionController.logout);

module.exports = router;
