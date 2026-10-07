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
// Step 2: a scheduled post goes up between 5 minutes and 30 days from now
// (Facebook's range is 20 min .. 29 days). A little slack under the 5
// minutes, for the time between picking it and the request arriving.
const MIN_SCHEDULE_MINUTES = 5;
const MAX_SCHEDULE_DAYS = 30;
const SCHEDULE_SLACK_MS = 60 * 1000;

// body.scheduledFor: undefined = not given, '' or null = not scheduled, or
// an ISO time in the allowed range -> a Date.
function readSchedule(raw, now = new Date()) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const when = typeof raw === 'string' ? new Date(raw) : null;
  if (!when || Number.isNaN(when.getTime())) throw new PostInputError(400, 'Invalid scheduledFor');
  if (when.getTime() < now.getTime() + MIN_SCHEDULE_MINUTES * 60 * 1000 - SCHEDULE_SLACK_MS) {
    throw new PostInputError(400, `Pick a time at least ${MIN_SCHEDULE_MINUTES} minutes from now`);
  }
  if (when.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) {
    throw new PostInputError(400, `You can schedule a post up to ${MAX_SCHEDULE_DAYS} days ahead`);
  }
  return when;
}

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

// A scheduled post must be one that could go up right now: better to hear
// about a missing question or photos-with-a-poll today than at 3:15 pm.
async function checkSchedulable(userId, fields, mediaUrls, scheduledFor) {
  if (scheduledFor) await postCreation.checkCanPublish(userId, fields, mediaUrls.length);
}

async function create(userId, body, newMediaUrls) {
  const fields = postCreation.readPostFields(body, { allowEmpty: true });
  const scheduledFor = readSchedule(body.scheduledFor) ?? null;
  await checkDraft(userId, fields, newMediaUrls);
  await checkSchedulable(userId, fields, newMediaUrls, scheduledFor);
  const count = await db.query('SELECT COUNT(*)::int AS n FROM post_drafts WHERE user_id = $1', [userId]);
  if (count.rows[0].n >= MAX_DRAFTS) throw new PostInputError(400, `You can keep up to ${MAX_DRAFTS} drafts`);
  const result = await db.query(
    `INSERT INTO post_drafts (user_id, content, visibility, community_id, page_id, poll, media_urls, scheduled_for)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [userId, fields.content, fields.visibility, fields.communityId, fields.pageId, fields.poll, newMediaUrls, scheduledFor]
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
// the photos left out are deleted. Without it, every photo stays. Without
// scheduledFor the draft keeps its time (if any); '' takes it off.
async function update(userId, draftId, body, newMediaUrls) {
  const row = await load(userId, draftId);
  const fields = postCreation.readPostFields(body, { allowEmpty: true });
  const given = readSchedule(body.scheduledFor);
  const scheduledFor = given === undefined ? row.scheduled_for : given;
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
  await checkSchedulable(userId, fields, mediaUrls, scheduledFor);
  const updated = await db.query(
    `UPDATE post_drafts SET content = $1, visibility = $2, community_id = $3, page_id = $4, poll = $5,
       media_urls = $6, scheduled_for = $7, last_error = NULL, updated_at = now()
     WHERE id = $8 AND user_id = $9 RETURNING id`,
    [fields.content, fields.visibility, fields.communityId, fields.pageId, fields.poll, mediaUrls, scheduledFor, draftId, userId]
  );
  // Published or deleted meanwhile: nothing to update (and the new photos
  // are deleted by the upload middleware with the 404).
  if (updated.rows.length === 0) throw new PostInputError(404, 'Draft not found');
  deleteMedia(row.media_urls.filter((url) => !kept.includes(url)));
  return loadSerialized(draftId);
}

// PUT /drafts/:id/schedule -- (re)schedule, or null to make it a plain
// draft again, without sending the whole form.
async function schedule(userId, draftId, body) {
  const scheduledFor = readSchedule(body?.scheduledFor);
  if (scheduledFor === undefined) throw new PostInputError(400, 'Invalid scheduledFor');
  const row = await load(userId, draftId);
  await checkSchedulable(userId, fieldsOf(row), row.media_urls, scheduledFor);
  const updated = await db.query(
    `UPDATE post_drafts SET scheduled_for = $1, last_error = NULL, updated_at = now()
     WHERE id = $2 AND user_id = $3 RETURNING id`,
    [scheduledFor, draftId, userId]
  );
  if (updated.rows.length === 0) throw new PostInputError(404, 'Draft not found');
  return loadSerialized(draftId);
}

async function remove(userId, draftId) {
  const result = await db.query('DELETE FROM post_drafts WHERE id = $1 AND user_id = $2 RETURNING media_urls', [draftId, userId]);
  if (result.rows.length === 0) throw new PostInputError(404, 'Draft not found');
  deleteMedia(result.rows[0].media_urls);
}

// Inside a transaction that holds the draft's row lock: checks it as a
// post of this moment, inserts the post and removes the draft. Its photos
// become the post's. Shared by "publish now" and the scheduler.
async function publishRow(client, row) {
  const fields = fieldsOf(row);
  await postCreation.checkCanPublish(row.user_id, fields, row.media_urls.length);
  const postRow = await postCreation.insertPost(client, row.user_id, fields, row.media_urls);
  await client.query('DELETE FROM post_drafts WHERE id = $1', [row.id]);
  return postRow;
}

// Publishes the draft now -- in one transaction, so it can't be published
// twice (the scheduler takes the same row lock).
async function publish(userId, draftId) {
  const client = await db.connect();
  let row;
  let postRow;
  try {
    await client.query('BEGIN');
    row = await load(userId, draftId, client, 'FOR UPDATE');
    postRow = await publishRow(client, row);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return postCreation.finishPost(postRow, userId, fieldsOf(row), row.media_urls);
}

module.exports = {
  MAX_DRAFTS, MIN_SCHEDULE_MINUTES, MAX_SCHEDULE_DAYS,
  create, list, get, update, schedule, remove, publish, publishRow, fieldsOf, serialize, readSchedule
};
