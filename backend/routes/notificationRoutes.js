const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

router.get('/notifications', authMiddleware, notificationController.getNotifications);
router.get('/notifications/unread-count', authMiddleware, notificationController.getUnreadCount);
router.put('/notifications/read-all', authMiddleware, notificationController.markAllAsRead);
router.put('/notifications/:id/read', authMiddleware, notificationController.markAsRead);

module.exports = router;
