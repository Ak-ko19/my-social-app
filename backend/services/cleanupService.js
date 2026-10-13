// Day 9: daily housekeeping, so tables don't grow forever on Neon's 0.5 GB
// and expired stories' photos don't stay public on Cloudinary. Run by
// POST /internal/cleanup (a GitHub Actions cron calls it) or
// `npm run cleanup`.
//
// Work is done in bounded batches: one run never holds a long lock, and a
// huge backlog is simply finished over the next days.
const db = require('../db');
const { deleteMedia } = require('./mediaCleanupService');
const { liftExpiredSuspensions } = require('./moderationService');
const scheduledPostService = require('./scheduledPostService');
const pollEndService = require('./pollEndService');
const eventNotificationService = require('./eventNotificationService');

const STORY_GRACE = '1 hour'; // past expires_at (stories already vanish from reads at expiry)
const NOTIFICATION_RETENTION = '90 days';
const REVOKED_SESSION_RETENTION = '1 day';
const ERROR_RETENTION = '90 days';
const STORY_BATCH = 500;
const ROW_BATCH = 5000;
const MAX_BATCHES = 20;

// Deletes up to MAX_BATCHES × `batch` rows matching `where` from `table`;
// returns how many went. `table`/`where` are constants from this file.
async function deleteInBatches(table, where, batch) {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const result = await db.query(
      `DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE ${where} LIMIT ${batch})`
    );
    total += result.rowCount;
    if (result.rowCount < batch) break;
  }
  return total;
}

async function countWhere(table, where) {
  return (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)).rows[0].n;
}

const STORIES_EXPIRED = `expires_at < now() - interval '${STORY_GRACE}'`;
const NOTIFICATIONS_OLD = `created_at < now() - interval '${NOTIFICATION_RETENTION}'`;
const SESSIONS_DEAD = `expires_at < now() OR revoked_at < now() - interval '${REVOKED_SESSION_RETENTION}'`;
// Day 10: error groups nobody has hit for 90 days.
const ERRORS_STALE = `last_seen < now() - interval '${ERROR_RETENTION}'`;
// Day 12: suspensions that have run out (most are lifted sooner, on the
// user's next request; this catches people who haven't been back).
const SUSPENSIONS_OVER = 'banned_until IS NOT NULL AND banned_until <= now()';
// Day 19: link previews are only a cache.
const PREVIEWS_OLD = "fetched_at < now() - interval '30 days'";
// Day 57: the upload ledger is for the daily limit and the admin's
// recent numbers -- a month is plenty.
const UPLOADS_OLD = "created_at < now() - interval '30 days'";
// Day 63: the admin audit log is kept for 2 years.
const ADMIN_LOG_OLD = "created_at < now() - interval '2 years'";

// Expired stories: rows first (their views cascade), then the media of
// exactly the rows that were deleted.
async function deleteExpiredStories() {
  let stories = 0;
  const media = [];
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const result = await db.query(
      `DELETE FROM stories WHERE id IN (SELECT id FROM stories WHERE ${STORIES_EXPIRED} LIMIT ${STORY_BATCH})
       RETURNING media_url`
    );
    stories += result.rowCount;
    media.push(...result.rows.map((r) => r.media_url));
    if (result.rowCount < STORY_BATCH) break;
  }
  await deleteMedia(media);
  return { stories, storyMedia: media.length };
}

async function run({ dryRun = false } = {}) {
  const started = Date.now();
  if (dryRun) {
    return {
      dryRun: true,
      stories: await countWhere('stories', STORIES_EXPIRED),
      notifications: await countWhere('notifications', NOTIFICATIONS_OLD),
      sessions: await countWhere('sessions', SESSIONS_DEAD),
      errorGroups: await countWhere('error_groups', ERRORS_STALE),
      suspensionsLifted: await countWhere('users', SUSPENSIONS_OVER),
      linkPreviews: await countWhere('link_previews', PREVIEWS_OLD),
      uploadLedger: await countWhere('media_uploads', UPLOADS_OLD),
      adminLog: await countWhere('admin_actions', ADMIN_LOG_OLD),
      scheduledPostsDue: await scheduledPostService.countDue(),
      endedPollsWaiting: await pollEndService.countWaiting(),
      durationMs: Date.now() - started
    };
  }
  const { stories, storyMedia } = await deleteExpiredStories();
  const notifications = await deleteInBatches('notifications', NOTIFICATIONS_OLD, ROW_BATCH);
  const sessions = await deleteInBatches('sessions', SESSIONS_DEAD, ROW_BATCH);
  const errorGroups = await deleteInBatches('error_groups', ERRORS_STALE, ROW_BATCH);
  const suspensionsLifted = await liftExpiredSuspensions();
  const linkPreviews = await deleteInBatches('link_previews', PREVIEWS_OLD, ROW_BATCH);
  const uploadLedger = await deleteInBatches('media_uploads', UPLOADS_OLD, ROW_BATCH);
  const adminLog = await deleteInBatches('admin_actions', ADMIN_LOG_OLD, ROW_BATCH);
  // Day 45: a backstop for the server's own 30 s ticker (services/ticker).
  const scheduledPosts = await scheduledPostService.publishDue();
  const endedPolls = await pollEndService.notifyEnded();
  const eventReminders = await eventNotificationService.remindDue();
  return {
    dryRun: false, stories, storyMedia, notifications, sessions, errorGroups, suspensionsLifted, linkPreviews, uploadLedger, adminLog,
    scheduledPostsPublished: scheduledPosts.published, scheduledPostsFailed: scheduledPosts.failed,
    endedPollsNotified: endedPolls.polls,
    eventRemindersSent: eventReminders.events,
    durationMs: Date.now() - started
  };
}

module.exports = { run, NOTIFICATION_RETENTION };
