// Day 45: drafts (migration 052), private to their author until published.
// A draft holds what the composer had -- text, audience, group or page,
// photos (already uploaded) or a poll -- and becomes a real post through
// postCreationService, under the same checks as posting directly.
const db = require('../db');
const postCreation = require('./postCreationService');
const { deleteMedia } = require('./mediaCleanupService');
const { MAX_POST_IMAGES } = require('../middleware/cloudinaryUpload');

const { PostInputError } = postCreation;
const MAX_DRAFTS = 50;

// What the API returns for a draft. The poll is shaped as POST /posts
// takes it ({ options, durationHours }), so the composer can send it back.
const DRAFT_COLUMNS = `d.id, d.content, d.visibility, d.community_id, d.page_id, d.poll, d.media_urls,
  d.scheduled_for, d.last_error, d.created_at, d.updated_at,
  c.name AS community_name, pg.name AS page_name`;
const DRAFT_FROM = 'post_drafts d LEFT JOIN communities c ON c.id = d.community_id LEFT JOIN pages pg ON pg.id = d.page_id';

function serialize(row) {
  const { media_urls: mediaUrls, poll, ...rest } = row;
  return {
    ...rest,
    media: mediaUrls.map((url) => ({ url })),
    poll: poll ? { options: poll.labels, durationHours: poll.durationHours } : null
  };
}

// A draft's fields as postCreationService takes them.
const fieldsOf = (row) => ({
  content: row.content,
  visibility: row.visibility,
  poll: row.poll,
  communityId: row.community_id,
  pageId: row.page_id
});

async function load(userId, draftId, queryable = db, lock = '') {
  const result = await queryable.query(
    `SELECT d.* FROM post_drafts d WHERE d.id = $1 AND d.user_id = $2 ${lock}`,
    [draftId, userId]
  );
  if (result.rows.length === 0) throw new PostInputError(404, 'Draft not found');
  return result.rows[0];
}

async function loadSerialized(draftId) {
  const result = await db.query(`SELECT ${DRAFT_COLUMNS} FROM ${DRAFT_FROM} WHERE d.id = $1`, [draftId]);
  return serialize(result.rows[0]);
}

// The checks for saving a draft: it holds something, a poll has no
// photos, at most MAX_POST_IMAGES photos, and the person may post in the
// group / as the page it names.
async function checkDraft(userId, fields, mediaUrls) {
  if (fields.content.trim() === '' && mediaUrls.length === 0 && !fields.poll) {
    throw new PostInputError(400, 'A draft needs text, a photo or a poll');
  }
  if (fields.poll && mediaUrls.length > 0) throw new PostInputError(400, "A poll can't have photos");
  if (mediaUrls.length > MAX_POST_IMAGES) throw new PostInputError(400, `You can attach up to ${MAX_POST_IMAGES} images`);
  await postCreation.checkAudience(userId, fields);
}

async function create(userId, body, newMediaUrls) {
  const fields = postCreation.readPostFields(body, { allowEmpty: true });
  await checkDraft(userId, fields, newMediaUrls);
  const count = await db.query('SELECT COUNT(*)::int AS n FROM post_drafts WHERE user_id = $1', [userId]);
  if (count.rows[0].n >= MAX_DRAFTS) throw new PostInputError(400, `You can keep up to ${MAX_DRAFTS} drafts`);
  const result = await db.query(
    `INSERT INTO post_drafts (user_id, content, visibility, community_id, page_id, poll, media_urls)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, fields.content, fields.visibility, fields.communityId, fields.pageId, fields.poll, newMediaUrls]
  );
  return loadSerialized(result.rows[0].id);
}

async function list(userId) {
  const result = await db.query(
    `SELECT ${DRAFT_COLUMNS} FROM ${DRAFT_FROM} WHERE d.user_id = $1 ORDER BY d.updated_at DESC, d.id DESC`,
    [userId]
  );
  return result.rows.map(serialize);
}

async function get(userId, draftId) {
  await load(userId, draftId);
  return loadSerialized(draftId);
}

// Replaces the draft's fields. `keepMedia` (a JSON list of its photo URLs,
// in order) says which photos stay; new uploads are added after them, and
// the photos left out are deleted. Without it, every photo stays.
async function update(userId, draftId, body, newMediaUrls) {
  const row = await load(userId, draftId);
  const fields = postCreation.readPostFields(body, { allowEmpty: true });
  let kept = row.media_urls;
  if (body.keepMedia !== undefined) {
    let keep;
    try {
      keep = typeof body.keepMedia === 'string' ? JSON.parse(body.keepMedia) : body.keepMedia;
    } catch {
      throw new PostInputError(400, 'Invalid keepMedia');
    }
    if (!Array.isArray(keep)) throw new PostInputError(400, 'Invalid keepMedia');
    // Only this draft's own photos, each once, in the order sent.
    kept = [...new Set(keep)].filter((url) => row.media_urls.includes(url));
  }
  const mediaUrls = [...kept, ...newMediaUrls];
  await checkDraft(userId, fields, mediaUrls);
  const updated = await db.query(
    `UPDATE post_drafts SET content = $1, visibility = $2, community_id = $3, page_id = $4, poll = $5,
       media_urls = $6, last_error = NULL, updated_at = now()
     WHERE id = $7 AND user_id = $8 RETURNING id`,
    [fields.content, fields.visibility, fields.communityId, fields.pageId, fields.poll, mediaUrls, draftId, userId]
  );
  // Published or deleted meanwhile: nothing to update (and the new photos
  // are deleted by the upload middleware with the 404).
  if (updated.rows.length === 0) throw new PostInputError(404, 'Draft not found');
  deleteMedia(row.media_urls.filter((url) => !kept.includes(url)));
  return loadSerialized(draftId);
}

async function remove(userId, draftId) {
  const result = await db.query('DELETE FROM post_drafts WHERE id = $1 AND user_id = $2 RETURNING media_urls', [draftId, userId]);
  if (result.rows.length === 0) throw new PostInputError(404, 'Draft not found');
  deleteMedia(result.rows[0].media_urls);
}

// Publishes the draft as a post, under the checks of this moment, and
// removes it -- in one transaction, so it can't be published twice (the
// scheduler takes the same row lock). Its photos become the post's.
async function publish(userId, draftId) {
  const client = await db.connect();
  let row;
  let postRow;
  try {
    await client.query('BEGIN');
    row = await load(userId, draftId, client, 'FOR UPDATE');
    const fields = fieldsOf(row);
    await postCreation.checkCanPublish(userId, fields, row.media_urls.length);
    postRow = await postCreation.insertPost(client, userId, fields, row.media_urls);
    await client.query('DELETE FROM post_drafts WHERE id = $1', [draftId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return postCreation.finishPost(postRow, userId, fieldsOf(row), row.media_urls);
}

module.exports = { MAX_DRAFTS, create, list, get, update, remove, publish, fieldsOf, serialize };
