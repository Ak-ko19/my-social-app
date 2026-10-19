// Day 57: Admin > Storage -- how full the free plans are (see
// services/storageService.js).
const { sendError } = require('../utils/httpError');
const storageService = require('../services/storageService');

// GET /admin/storage
async function getStorage(req, res) {
  try {
    res.json(await storageService.report());
  } catch (err) {
    sendError(res, err, 'Loading storage failed. Please try again later.');
  }
}

module.exports = { getStorage };
