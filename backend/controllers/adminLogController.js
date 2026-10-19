// Day 63: Admin > Log (see services/adminLogService.js).
const { sendError } = require('../utils/httpError');
const adminLog = require('../services/adminLogService');

// GET /admin/log?page=N&action=<one of adminLog.ACTIONS>
async function getLog(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const action = req.query.action || null;
  if (action !== null && !adminLog.ACTIONS.includes(action)) {
    return res.status(400).send(`action must be one of: ${adminLog.ACTIONS.join(', ')}`);
  }
  try {
    res.json(await adminLog.list({ page, action }));
  } catch (err) {
    sendError(res, err, 'Loading the admin log failed. Please try again later.');
  }
}

module.exports = { getLog };
