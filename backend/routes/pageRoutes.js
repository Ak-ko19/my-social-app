const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const p = require('../controllers/pageController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// B14 Pages. Reading a page and its posts works logged out (optionalAuth);
// creating, editing and following need a login.
router.post('/pages', authMiddleware, p.createPage);
router.get('/pages', authMiddleware, p.listPages);
router.get('/pages/:id', optionalAuth, p.getPage);
router.patch('/pages/:id', authMiddleware, p.updatePage);
router.delete('/pages/:id', authMiddleware, p.deletePage);
router.get('/pages/:id/posts', optionalAuth, p.listPagePosts);
router.post('/pages/:id/follow', authMiddleware, p.followPage);
router.delete('/pages/:id/follow', authMiddleware, p.unfollowPage);
// Day 101: which of the page's new posts you hear about.
router.put('/pages/:id/notifications', authMiddleware, p.setPostNotifications);
// Day 53: page admins.
router.get('/pages/:id/admins', authMiddleware, p.listAdmins);
router.post('/pages/:id/admins', authMiddleware, p.addAdmin);
router.delete('/pages/:id/admins/:userId', authMiddleware, p.removeAdmin);

module.exports = router;
