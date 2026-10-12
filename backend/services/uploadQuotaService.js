// Day 57: a daily upload budget per person, so one account (or a script
// behind it) can't fill the free Cloudinary plan. Counted from the
// media_uploads ledger over the last 24 hours; checked BEFORE anything is
// sent to Cloudinary, so a refused upload costs nothing. Limits can be set
// with env vars (names only: UPLOAD_LIMIT_FILES_PER_DAY,
// UPLOAD_LIMIT_MB_PER_DAY).
const db = require('../db');

const DEFAULT_FILES_PER_DAY = 100;
const DEFAULT_MB_PER_DAY = 300;

const positive = (raw, fallback) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
function limits() {
  return {
    files: positive(process.env.UPLOAD_LIMIT_FILES_PER_DAY, DEFAULT_FILES_PER_DAY),
    bytes: positive(process.env.UPLOAD_LIMIT_MB_PER_DAY, DEFAULT_MB_PER_DAY) * 1024 * 1024
  };
}

const TOO_MANY = "You've reached today's upload limit. Please try again tomorrow.";

class UploadLimitError extends Error {
  constructor() {
    super(TOO_MANY);
    this.status = 429;
    this.expose = true;
  }
}

// Throws an UploadLimitError when `files` ([{ size }]) would take the
// person over today's budget.
async function checkQuota(userId, files) {
  if (!userId || files.length === 0) return;
  const { files: maxFiles, bytes: maxBytes } = limits();
  const used = (await db.query(
    `SELECT COUNT(*)::int AS files, COALESCE(SUM(bytes), 0)::bigint AS bytes
     FROM media_uploads WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
    [userId]
  )).rows[0];
  const adding = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (used.files + files.length > maxFiles || Number(used.bytes) + adding > maxBytes) throw new UploadLimitError();
}

// After the files are stored: one ledger row each. Cloudinary's own byte
// count when it gives one (after its processing), else the upload's size.
async function record(userId, kind, stored) {
  if (!userId || stored.length === 0) return;
  await db.query(
    'INSERT INTO media_uploads (user_id, kind, bytes) SELECT $1, $2, unnest($3::bigint[])',
    [userId, kind, stored.map((s) => s.bytes)]
  );
}

module.exports = { checkQuota, record, limits, UploadLimitError, TOO_MANY };
