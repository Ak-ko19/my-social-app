const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');
const errorLogController = require('../controllers/errorLogController');
const storageController = require('../controllers/storageController');
const statsController = require('../controllers/statsController');
const adminLogController = require('../controllers/adminLogController');
const adminSearchController = require('../controllers/adminSearchController');
const pageVerificationController = require('../controllers/pageVerificationController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// B12 admin moderation. Every route: logged in AND users.is_admin (checked
// in the DB on each request). Non-admins get 404.
const admin = [authMiddleware, requireAdmin];
router.get('/admin/reports', ...admin, adminController.listReports);
router.post('/admin/reports/:id/dismiss', ...admin, adminController.dismissReport);
router.post('/admin/reports/:id/remove-content', ...admin, adminController.removeReportedContent);
// Day 103: the same action on several reports.
router.post('/admin/reports/bulk', ...admin, adminController.bulkReports);
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
// Days 103-104: search posts, comments and accounts (every search is logged).
router.get('/admin/search', ...admin, adminSearchController.search);
// Day 106: page verification requests, and taking a tick away.
router.get('/admin/page-verifications', ...admin, pageVerificationController.listRequests);
router.post('/admin/page-verifications/:id/approve', ...admin, pageVerificationController.approve);
router.post('/admin/page-verifications/:id/decline', ...admin, pageVerificationController.decline);
router.post('/admin/pages/:id/unverify', ...admin, pageVerificationController.unverify);

module.exports = router;
