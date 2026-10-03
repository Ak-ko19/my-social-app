const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { linkPreviewLimiter } = require('../middleware/rateLimiter');
const { getPreview, normalizeUrl } = require('../services/linkPreviewService');
const { sendServerError } = require('../utils/sendError');

const router = express.Router();

// Day 19: GET /link-preview?url=... -> { url, title, description, siteName },
// or 204 when the page has nothing to show (or can't / mustn't be fetched).
// Logged-in only: the server fetching pages is not a public service.
router.get('/link-preview', authMiddleware, linkPreviewLimiter, async (req, res) => {
  if (!normalizeUrl(req.query.url)) return res.status(400).send('A valid http(s) url is required');
  try {
    const preview = await getPreview(req.query.url);
    // Browsers may keep it a while; the server's own cache does the rest.
    res.set('Cache-Control', 'private, max-age=3600');
    if (!preview) return res.status(204).end();
    res.json(preview);
  } catch (err) {
    sendServerError(res, err, 'Loading the link preview failed.');
  }
});

module.exports = router;
