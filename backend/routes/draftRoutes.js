const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { uploadPostImages, uploadManyToCloudinary } = require('../middleware/cloudinaryUpload');
const draftController = require('../controllers/draftController');
const { wholeIds } = require('../middleware/wholeIds');
// Day 85: ids in the path are whole numbers (middleware/wholeIds).
wholeIds(router);

// Day 45: drafts. Photos go to the posts folder: a published draft's
// photos become its post's.
router.post('/drafts', authMiddleware, uploadPostImages, uploadManyToCloudinary('posts'), draftController.createDraft);
router.get('/drafts', authMiddleware, draftController.listDrafts);
router.get('/drafts/:id', authMiddleware, draftController.getDraft);
router.put('/drafts/:id', authMiddleware, uploadPostImages, uploadManyToCloudinary('posts'), draftController.updateDraft);
router.put('/drafts/:id/schedule', authMiddleware, draftController.scheduleDraft);
router.delete('/drafts/:id', authMiddleware, draftController.deleteDraft);
router.post('/drafts/:id/publish', authMiddleware, draftController.publishDraft);

module.exports = router;
