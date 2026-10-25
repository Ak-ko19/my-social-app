const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

router.get('/notifications', authMiddleware, notificationController.getNotifications);
// B11 notification settings.
router.get('/notification-preferences', authMiddleware, notificationController.getPreferences);
router.put('/notification-preferences', authMiddleware, notificationController.updatePreferences);
router.get('/notifications/unread-count', authMiddleware, notificationController.getUnreadCount);
router.put('/notifications/read-all', authMiddleware, notificationController.markAllAsRead);
router.put('/notifications/:id/read', authMiddleware, notificationController.markAsRead);

module.exports = router;
