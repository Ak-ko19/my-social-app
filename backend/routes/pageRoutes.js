const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const p = require('../controllers/pageController');

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

module.exports = router;
