// Day 106: page verification requests (services/pageVerificationService.js).
// The page's side (its owner and admins, under /pages/:id/verification) and
// the admins' queue (Admin > Verification, under /admin).
const { HttpError, sendError } = require('../utils/httpError');
const { loadManagedPage } = require('./pageController');
const verification = require('../services/pageVerificationService');

// GET /pages/:id/verification -> the page's verification state.
async function getState(req, res) {
  try {
    const page = await loadManagedPage(Number(req.params.id), req.userId);
    res.json(await verification.stateOf(page));
  } catch (err) {
    sendError(res, err, 'Loading the verification status failed. Please try again later.');
  }
}

// POST /pages/:id/verification { note, link? } -> 201 and the new state.
async function requestVerification(req, res) {
  try {
    const page = await loadManagedPage(Number(req.params.id), req.userId);
    res.status(201).json(await verification.request(page, req.userId, req.body));
  } catch (err) {
    sendError(res, err, 'Sending the request failed. Please try again later.');
  }
}

// DELETE /pages/:id/verification -> the state, with no request waiting.
async function withdrawRequest(req, res) {
  try {
    const page = await loadManagedPage(Number(req.params.id), req.userId);
    res.json(await verification.withdraw(page));
  } catch (err) {
    sendError(res, err, 'Withdrawing the request failed. Please try again later.');
  }
}

// GET /admin/page-verifications?status=pending|reviewed&page=N
// -> { requests, hasMore, page }
async function listRequests(req, res) {
  try {
    const status = req.query.status === undefined ? 'pending' : String(req.query.status);
    if (!verification.STATUSES.includes(status)) throw new HttpError(400, 'status must be pending or reviewed');
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isInteger(page) || page < 1) throw new HttpError(400, 'page must be a whole number from 1');
    res.json(await verification.list({ status, page }));
  } catch (err) {
    sendError(res, err, 'Loading verification requests failed. Please try again later.');
  }
}

// POST /admin/page-verifications/:id/approve
async function approve(req, res) {
  try {
    res.json(await verification.approve(Number(req.params.id), req.userId));
  } catch (err) {
    sendError(res, err, 'Approving the request failed. Please try again later.');
  }
}

// POST /admin/page-verifications/:id/decline { reason }
async function decline(req, res) {
  try {
    res.json(await verification.decline(Number(req.params.id), req.userId, req.body));
  } catch (err) {
    sendError(res, err, 'Declining the request failed. Please try again later.');
  }
}

// POST /admin/pages/:id/unverify { reason }
async function unverify(req, res) {
  try {
    res.json(await verification.unverify(Number(req.params.id), req.userId, req.body));
  } catch (err) {
    sendError(res, err, 'Removing the verification failed. Please try again later.');
  }
}

module.exports = { getState, requestVerification, withdrawRequest, listRequests, approve, decline, unverify };
