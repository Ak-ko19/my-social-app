// Day 61: Admin > Overview (see services/statsService.js).
const { sendError } = require('../utils/httpError');
const statsService = require('../services/statsService');

// GET /admin/overview?days=7|30|90 (default 30)
async function getOverview(req, res) {
  const days = req.query.days === undefined ? 30 : Number(req.query.days);
  if (!statsService.RANGES.includes(days)) {
    return res.status(400).send(`days must be one of: ${statsService.RANGES.join(', ')}`);
  }
  try {
    res.json(await statsService.overview(days));
  } catch (err) {
    sendError(res, err, 'Loading the overview failed. Please try again later.');
  }
}

module.exports = { getOverview };
