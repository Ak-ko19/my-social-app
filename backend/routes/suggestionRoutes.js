const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const suggestionsController = require('../controllers/suggestionsController');

// B8 "People you may know". Must be registered BEFORE any /users/:id
// route could shadow it -- 'suggestions' isn't numeric, but keeping the
// literal path first avoids relying on each :id handler's isNaN check.
router.get('/users/suggestions', authMiddleware, suggestionsController.getSuggestions);
// Day 39: hide someone from your suggestions.
router.post('/users/suggestions/:id/dismiss', authMiddleware, suggestionsController.dismissSuggestion);

module.exports = router;
