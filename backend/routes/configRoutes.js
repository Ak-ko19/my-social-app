const express = require('express');
const { emailEnabled } = require('../utils/email');

const router = express.Router();

// GET /config -- public facts the frontend needs before anyone logs in.
// emailEnabled: false means emails can't be sent right now (production
// without an email provider), so the UI hides flows that depend on email
// instead of promising a message that never arrives.
router.get('/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ emailEnabled: emailEnabled() });
});

module.exports = router;
