const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const restrictController = require('../controllers/restrictController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// Day 47: restricted people.
router.post('/users/:id/restrict', authMiddleware, restrictController.restrictUser);
router.delete('/users/:id/restrict', authMiddleware, restrictController.unrestrictUser);
router.get('/restricted-users', authMiddleware, restrictController.getRestrictedUsers);

module.exports = router;
