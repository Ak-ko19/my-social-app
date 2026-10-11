const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const e = require('../controllers/eventController');

// Day 55: events. Reading a public event (and its guests) works logged
// out, like a public post; everything else needs a login.
router.post('/events', authMiddleware, e.createEvent);
router.get('/events', authMiddleware, e.listEvents);
router.get('/events/:id', optionalAuth, e.getEvent);
router.patch('/events/:id', authMiddleware, e.updateEvent);
router.delete('/events/:id', authMiddleware, e.deleteEvent);
router.post('/events/:id/cancel', authMiddleware, e.cancelEvent);
router.put('/events/:id/response', authMiddleware, e.respond);
router.delete('/events/:id/response', authMiddleware, e.removeResponse);
router.get('/events/:id/guests', optionalAuth, e.listGuests);

module.exports = router;
