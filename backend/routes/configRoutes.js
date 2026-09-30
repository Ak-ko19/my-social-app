const express = require('express');
const { emailEnabled } = require('../utils/email');
const { turnstileSiteKey } = require('../services/turnstile');

const router = express.Router();

// GET /config -- public facts the frontend needs before anyone logs in.
// emailEnabled: false means emails can't be sent right now (production
// without an email provider), so the UI hides flows that depend on email
// instead of promising a message that never arrives.
// turnstileSiteKey: the public Turnstile key when the check is on (both
// keys set), else null -- the forms then show no widget.
router.get('/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ emailEnabled: emailEnabled(), turnstileSiteKey: turnstileSiteKey() });
});

module.exports = router;
