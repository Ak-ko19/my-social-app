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
// Day 36: cover photo.
router.put('/profile/cover', authMiddleware, upload.single('cover'), uploadToCloudinary('covers'), profileController.setCover);
router.delete('/profile/cover', authMiddleware, profileController.removeCover);
router.put('/profile/privacy', authMiddleware, profileController.updatePrivacy);
router.put('/profile/language', authMiddleware, profileController.updateLanguage);

module.exports = router;
