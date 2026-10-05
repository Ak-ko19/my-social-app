const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const { upload, uploadToCloudinary } = require('../middleware/cloudinaryUpload');
const profileController = require('../controllers/profileController');
const { dataExportLimiter } = require('../middleware/rateLimiter');

// Order matters: /profile/me and /profile/export must come before /profile/:id
router.get('/profile/me', authMiddleware, profileController.getMyProfile);
router.get('/profile/export', authMiddleware, dataExportLimiter, profileController.exportMyData);
router.get('/profile/:id', optionalAuth, profileController.getProfile);
router.put('/profile', authMiddleware, upload.single('avatar'), uploadToCloudinary('avatars'), profileController.updateProfile);
router.put('/profile/privacy', authMiddleware, profileController.updatePrivacy);
router.put('/profile/language', authMiddleware, profileController.updateLanguage);

module.exports = router;
