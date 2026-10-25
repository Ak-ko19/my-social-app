const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const { upload, uploadToCloudinary } = require('../middleware/cloudinaryUpload');
const profileController = require('../controllers/profileController');
const { dataExportLimiter } = require('../middleware/rateLimiter');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router, ['userId', 'messageId', 'followerId']);

// Order matters: /profile/me and /profile/export must come before /profile/:id
router.get('/profile/me', authMiddleware, profileController.getMyProfile);
router.get('/profile/export', authMiddleware, dataExportLimiter, profileController.exportMyData);
router.get('/profile/:id', optionalAuth, profileController.getProfile);
router.put('/profile', authMiddleware, upload.single('avatar'), uploadToCloudinary('avatars'), profileController.updateProfile);
// Day 36: cover photo.
router.put('/profile/cover', authMiddleware, upload.single('cover'), uploadToCloudinary('covers'), profileController.setCover);
router.delete('/profile/cover', authMiddleware, profileController.removeCover);
// Day 78: the profile photo alone, and the end of the first-run steps.
router.put('/profile/avatar', authMiddleware, upload.single('avatar'), uploadToCloudinary('avatars'), profileController.setAvatar);
router.post('/profile/onboarding/done', authMiddleware, profileController.finishOnboarding);
// Day 36: one post pinned to the top of your profile.
router.put('/profile/pinned-post', authMiddleware, profileController.pinPost);
router.delete('/profile/pinned-post', authMiddleware, profileController.unpinPost);
router.put('/profile/privacy', authMiddleware, profileController.updatePrivacy);
router.put('/profile/language', authMiddleware, profileController.updateLanguage);
// Day 84: the app's time zone (memories in your own morning).
router.put('/profile/time-zone', authMiddleware, profileController.updateTimeZone);
// Day 47: who can message you / comment on your posts.
router.put('/profile/interactions', authMiddleware, profileController.updateInteractions);

module.exports = router;
