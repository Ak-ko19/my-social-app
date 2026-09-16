const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const profileController = require('../controllers/profileController');

// Order matters: /profile/me must come before /profile/:id
router.get('/profile/me', authMiddleware, profileController.getMyProfile);
router.get('/profile/:id', profileController.getProfile);
router.put('/profile', authMiddleware, upload.single('avatar'), upload.validateImageContent, profileController.updateProfile);

module.exports = router;
