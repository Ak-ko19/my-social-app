// Day 46: saved collections -- see services/collectionService.
const collectionService = require('../services/collectionService');
const { getPagination } = require('../utils/pagination');
const { sendError } = require('../utils/httpError');

const idParam = (raw) => (/^\d+$/.test(raw) ? Number(raw) : null);

// Runs `work`; a CollectionError becomes its status and message (sendError).
const handle = (fallback, work) => async (req, res) => {
  try {
    await work(req, res);
  } catch (err) {
    sendError(res, err, fallback);
  }
};
const withId = (param, invalid, fallback, work) => handle(fallback, async (req, res) => {
  const id = idParam(req.params[param]);
  if (id === null) return res.status(400).send(invalid);
  await work(req, res, id);
});

const listCollections = handle('Loading collections failed. Please try again later.', async (req, res) => {
  res.json(await collectionService.list(req.userId));
});

const createCollection = handle('Creating the collection failed. Please try again later.', async (req, res) => {
  res.status(201).json(await collectionService.create(req.userId, req.body));
});

const renameCollection = withId('id', 'Invalid collection ID', 'Renaming the collection failed. Please try again later.', async (req, res, id) => {
  res.json(await collectionService.rename(req.userId, id, req.body));
});

const deleteCollection = withId('id', 'Invalid collection ID', 'Deleting the collection failed. Please try again later.', async (req, res, id) => {
  await collectionService.remove(req.userId, id);
  res.json({ deleted: true });
});

const collectionPosts = withId('id', 'Invalid collection ID', 'Loading the collection failed. Please try again later.', async (req, res, id) => {
  const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });
  res.json({ page, ...(await collectionService.posts(req.userId, id, { limit, offset })) });
});

const postCollections = withId('id', 'Invalid post ID', 'Loading collections failed. Please try again later.', async (req, res, id) => {
  res.json({ collectionIds: await collectionService.collectionsOfPost(req.userId, id) });
});

const setPostCollections = withId('id', 'Invalid post ID', 'Saving to collections failed. Please try again later.', async (req, res, id) => {
  res.json(await collectionService.setCollectionsOfPost(req.userId, id, req.body));
});

module.exports = { listCollections, createCollection, renameCollection, deleteCollection, collectionPosts, postCollections, setPostCollections };
