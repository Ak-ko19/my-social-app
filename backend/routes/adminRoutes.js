const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');
const errorLogController = require('../controllers/errorLogController');
const storageController = require('../controllers/storageController');
const statsController = require('../controllers/statsController');
const adminLogController = require('../controllers/adminLogController');

// B12 admin moderation. Every route: logged in AND users.is_admin (checked
// in the DB on each request). Non-admins get 404.
const admin = [authMiddleware, requireAdmin];
router.get('/admin/reports', ...admin, adminController.listReports);
router.post('/admin/reports/:id/dismiss', ...admin, adminController.dismissReport);
router.post('/admin/reports/:id/remove-content', ...admin, adminController.removeReportedContent);
router.post('/admin/users/:id/ban', ...admin, adminController.banUser);
router.post('/admin/users/:id/suspend', ...admin, adminController.suspendUser);
router.post('/admin/users/:id/unban', ...admin, adminController.unbanUser);
// Day 10: built-in error log.
router.get('/admin/errors', ...admin, errorLogController.listErrors);
router.post('/admin/errors/:fingerprint/resolve', ...admin, errorLogController.resolveError);
// Day 57: how full the free plans are.
router.get('/admin/storage', ...admin, storageController.getStorage);
// Day 61: the overview (daily counts, totals, storage levels).
router.get('/admin/overview', ...admin, statsController.getOverview);
// Day 63: the audit log of admin actions.
router.get('/admin/log', ...admin, adminLogController.getLog);

module.exports = router;
