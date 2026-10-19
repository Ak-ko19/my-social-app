// Day 45: drafts -- see services/draftService. Every route is the author's
// own: someone else's draft answers 404, like one that doesn't exist.
const draftService = require('../services/draftService');
const { sendError } = require('../utils/httpError');

const uploadedUrls = (req) => (req.cloudinaryResults || []).map((r) => r.secure_url);
const draftId = (req) => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : null);

// Runs `work`; a PostInputError becomes its status and message (sendError).
const handle = (fallback, work) => async (req, res) => {
  try {
    await work(req, res);
  } catch (err) {
    sendError(res, err, fallback);
  }
};
const withId = (fallback, work) => handle(fallback, async (req, res) => {
  const id = draftId(req);
  if (id === null) return res.status(400).send('Invalid draft ID');
  await work(req, res, id);
});

// POST /drafts -- the composer's form (like POST /posts, text optional).
const createDraft = handle('Saving the draft failed. Please try again later.', async (req, res) => {
  res.status(201).json(await draftService.create(req.userId, req.body, uploadedUrls(req)));
});

// GET /drafts -- yours, most recently edited first.
const listDrafts = handle('Loading drafts failed. Please try again later.', async (req, res) => {
  res.json(await draftService.list(req.userId));
});

const getDraft = withId('Loading the draft failed. Please try again later.', async (req, res, id) => {
  res.json(await draftService.get(req.userId, id));
});

// PUT /drafts/:id -- the composer's form again, plus keepMedia.
const updateDraft = withId('Saving the draft failed. Please try again later.', async (req, res, id) => {
  res.json(await draftService.update(req.userId, id, req.body, uploadedUrls(req)));
});

// PUT /drafts/:id/schedule { scheduledFor } -- a time, or null to unschedule.
const scheduleDraft = withId('Scheduling failed. Please try again later.', async (req, res, id) => {
  res.json(await draftService.schedule(req.userId, id, req.body));
});

const deleteDraft = withId('Deleting the draft failed. Please try again later.', async (req, res, id) => {
  await draftService.remove(req.userId, id);
  res.json({ deleted: true });
});

// POST /drafts/:id/publish -- post it now.
const publishDraft = withId('Publishing failed. Please try again later.', async (req, res, id) => {
  res.status(201).json(await draftService.publish(req.userId, id));
});

module.exports = { createDraft, listDrafts, getDraft, updateDraft, scheduleDraft, deleteDraft, publishDraft };
