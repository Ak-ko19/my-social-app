const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { reportLimiter } = require('../middleware/rateLimiter');
const reportController = require('../controllers/reportController');

router.post('/reports', authMiddleware, reportLimiter, reportController.createReport);

module.exports = router;
