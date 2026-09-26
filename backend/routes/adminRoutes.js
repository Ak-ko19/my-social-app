const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');

// B12 admin moderation. Every route: logged in AND users.is_admin (checked
// in the DB on each request). Non-admins get 404.
const admin = [authMiddleware, requireAdmin];
router.get('/admin/reports', ...admin, adminController.listReports);
router.post('/admin/reports/:id/dismiss', ...admin, adminController.dismissReport);
router.post('/admin/reports/:id/remove-content', ...admin, adminController.removeReportedContent);
router.post('/admin/users/:id/ban', ...admin, adminController.banUser);
router.post('/admin/users/:id/unban', ...admin, adminController.unbanUser);

module.exports = router;
