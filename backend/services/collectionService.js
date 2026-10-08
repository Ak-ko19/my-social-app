// Day 46: saved posts in named collections (migration 054), like
// Instagram's. Private to their owner: someone else's collection answers
// 404, like one that doesn't exist.
const db = require('../db');
const { getVisiblePost } = require('./postVisibilityService');
const { listSaved, STILL_VISIBLE_SQL } = require('./savedPostsService');
const { toUnicode } = require('../utils/myanmarText');

const MAX_COLLECTIONS = 30;
const MAX_NAME_LENGTH = 50;

class CollectionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// A collection name as typed: trimmed, not empty, up to 50 characters.
function readName(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') throw new CollectionError(400, 'A collection needs a name');
  const name = toUnicode(raw.trim()); // Day 43: Zawgyi Burmese is stored as Unicode
  if (name.length > MAX_NAME_LENGTH) throw new CollectionError(400, `Collection names can be up to ${MAX_NAME_LENGTH} characters`);
  return name;
}

const isDuplicate = (err) => err.code === '23505';

// Yours, newest first, each with how many saved posts in it you can still
// see and the newest one's first photo as its cover.
async function list(userId) {
  const result = await db.query(
    `SELECT c.id, c.name, c.created_at, c.updated_at,
       (SELECT COUNT(*)::int FROM bookmark_collection_items items
          JOIN bookmarks ON bookmarks.id = items.bookmark_id
          JOIN posts ON posts.id = bookmarks.post_id
          JOIN users ON users.id = posts.user_id
        WHERE items.collection_id = c.id AND ${STILL_VISIBLE_SQL}) AS post_count,
       (SELECT COALESCE(
            (SELECT pm.url FROM post_media pm WHERE pm.post_id = posts.id ORDER BY pm.position LIMIT 1), posts.image_url)
        FROM bookmark_collection_items items
          JOIN bookmarks ON bookmarks.id = items.bookmark_id
          JOIN posts ON posts.id = bookmarks.post_id
          JOIN users ON users.id = posts.user_id
        WHERE items.collection_id = c.id AND ${STILL_VISIBLE_SQL}
          AND (posts.image_url IS NOT NULL OR EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = posts.id))
        ORDER BY items.added_at DESC LIMIT 1) AS cover_url
     FROM bookmark_collections c
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC, c.id DESC`,
    [userId]
  );
  return result.rows;
}

async function own(userId, collectionId) {
  const result = await db.query('SELECT id, name, created_at, updated_at FROM bookmark_collections WHERE id = $1 AND user_id = $2', [collectionId, userId]);
  if (result.rows.length === 0) throw new CollectionError(404, 'Collection not found');
  return result.rows[0];
}

async function create(userId, body) {
  const name = readName(body?.name);
  const count = await db.query('SELECT COUNT(*)::int AS n FROM bookmark_collections WHERE user_id = $1', [userId]);
  if (count.rows[0].n >= MAX_COLLECTIONS) throw new CollectionError(400, `You can have up to ${MAX_COLLECTIONS} collections`);
  try {
    const result = await db.query(
      'INSERT INTO bookmark_collections (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at, updated_at',
      [userId, name]
    );
    return { ...result.rows[0], post_count: 0, cover_url: null };
  } catch (err) {
    if (isDuplicate(err)) throw new CollectionError(409, 'You already have a collection with that name');
    throw err;
  }
}

async function rename(userId, collectionId, body) {
  const name = readName(body?.name);
  try {
    const result = await db.query(
      `UPDATE bookmark_collections SET name = $1, updated_at = now() WHERE id = $2 AND user_id = $3
       RETURNING id, name, created_at, updated_at`,
      [name, collectionId, userId]
    );
    if (result.rows.length === 0) throw new CollectionError(404, 'Collection not found');
    return result.rows[0];
  } catch (err) {
    if (isDuplicate(err)) throw new CollectionError(409, 'You already have a collection with that name');
    throw err;
  }
}

// The posts stay saved (and in your other collections).
async function remove(userId, collectionId) {
  const result = await db.query('DELETE FROM bookmark_collections WHERE id = $1 AND user_id = $2', [collectionId, userId]);
  if (result.rowCount === 0) throw new CollectionError(404, 'Collection not found');
}

async function posts(userId, collectionId, { limit, offset }) {
  const collection = await own(userId, collectionId);
  return { collection, ...(await listSaved(userId, { limit, offset, collectionId })) };
}

// The ids of your collections this post is in.
async function collectionsOfPost(userId, postId) {
  const result = await db.query(
    `SELECT items.collection_id FROM bookmark_collection_items items
     JOIN bookmarks ON bookmarks.id = items.bookmark_id
     WHERE bookmarks.user_id = $1 AND bookmarks.post_id = $2
     ORDER BY items.collection_id`,
    [userId, postId]
  );
  return result.rows.map((r) => r.collection_id);
}

// PUT /posts/:id/collections { collectionIds }: the post is in exactly
// these of your collections afterwards -- saved first if it wasn't (like
// Instagram, where saving to a collection also saves). An empty list takes
// it out of every collection but keeps it saved.
async function setCollectionsOfPost(userId, postId, body) {
  const ids = body?.collectionIds;
  if (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id))) throw new CollectionError(400, 'collectionIds must be a list of ids');
  const wanted = [...new Set(ids)];
  if (!(await getVisiblePost(postId, userId))) throw new CollectionError(404, 'Post not found');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const mine = await client.query('SELECT id FROM bookmark_collections WHERE user_id = $1 AND id = ANY($2::int[])', [userId, wanted]);
    if (mine.rows.length !== wanted.length) throw new CollectionError(404, 'Collection not found');
    const bookmark = (await client.query(
      `INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING id`,
      [userId, postId]
    )).rows[0];
    await client.query(
      'DELETE FROM bookmark_collection_items WHERE bookmark_id = $1 AND NOT (collection_id = ANY($2::int[]))',
      [bookmark.id, wanted]
    );
    await client.query(
      `INSERT INTO bookmark_collection_items (collection_id, bookmark_id)
       SELECT unnest($2::int[]), $1 ON CONFLICT DO NOTHING`,
      [bookmark.id, wanted]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { saved: true, collectionIds: await collectionsOfPost(userId, postId) };
}

module.exports = {
  MAX_COLLECTIONS, MAX_NAME_LENGTH, CollectionError,
  list, create, rename, remove, posts, collectionsOfPost, setCollectionsOfPost
};
