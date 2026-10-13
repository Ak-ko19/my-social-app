// Day 57: how full the free plans are, for Admin > Storage -- the database
// (Neon's free plan: 0.5 GB) measured by Postgres itself, Cloudinary's
// usage from its Admin API (with the keys already set; no new account),
// and what people uploaded in the last 24 hours (media_uploads). Each
// gets a level: ok, warn from 80 %, alert from 95 %.
const db = require('../db');
const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');

const WARN_AT = 80;
const ALERT_AT = 95;
const DEFAULT_DB_LIMIT_MB = 512;
const CLOUDINARY_CACHE_MS = 10 * 60 * 1000; // its Admin API is rate limited

const levelOf = (percent) => (percent === null ? 'unknown' : percent >= ALERT_AT ? 'alert' : percent >= WARN_AT ? 'warn' : 'ok');
const percentOf = (used, limit) => (limit > 0 ? Math.round((used / limit) * 1000) / 10 : null);

function dbLimitBytes() {
  const mb = Number(process.env.NEON_STORAGE_LIMIT_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_DB_LIMIT_MB) * 1024 * 1024;
}

// How full the database is (Day 61: also on Admin > Overview).
async function databaseUsage() {
  const size = await db.query('SELECT pg_database_size(current_database())::bigint AS bytes');
  const bytes = Number(size.rows[0].bytes);
  const limitBytes = dbLimitBytes();
  const percent = percentOf(bytes, limitBytes);
  return { bytes, limitBytes, percent, level: levelOf(percent) };
}

async function database() {
  const tables = await db.query(
    `SELECT relname AS name, pg_total_relation_size(relid)::bigint AS bytes
     FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC, relname LIMIT 8`
  );
  return { ...(await databaseUsage()), tables: tables.rows.map((t) => ({ name: t.name, bytes: Number(t.bytes) })) };
}

let cached = null; // { at, value }

const cloudinaryConfigured = () => Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

async function cloudinaryUsage({ now = Date.now() } = {}) {
  if (!cloudinaryConfigured()) return { configured: false, level: 'unknown' };
  if (cached && now - cached.at < CLOUDINARY_CACHE_MS) return cached.value;
  let value;
  try {
    const u = await cloudinary.api.usage();
    // Free plans count "credits" (storage, bandwidth and transformations
    // together); its own percent when given.
    const used = u.credits?.usage ?? null;
    const limit = u.credits?.limit ?? null;
    const percent = Number.isFinite(u.credits?.used_percent) ? u.credits.used_percent : (used !== null && limit ? percentOf(used, limit) : null);
    value = {
      configured: true,
      plan: u.plan || null,
      creditsUsed: used,
      creditsLimit: limit,
      percent,
      level: levelOf(percent),
      storageBytes: u.storage?.usage ?? null,
      bandwidthBytes: u.bandwidth?.usage ?? null,
      objects: u.objects?.usage ?? null
    };
  } catch (err) {
    logger.warn('cloudinary usage unavailable', { err });
    value = { configured: true, error: 'unavailable', level: 'unknown' };
  }
  cached = { at: now, value };
  return value;
}

async function recentUploads() {
  const totals = await db.query(
    `SELECT COUNT(*)::int AS files, COALESCE(SUM(bytes), 0)::bigint AS bytes
     FROM media_uploads WHERE created_at > now() - interval '24 hours'`
  );
  const top = await db.query(
    `SELECT u.id, u.username, COUNT(*)::int AS files, SUM(m.bytes)::bigint AS bytes
     FROM media_uploads m JOIN users u ON u.id = m.user_id
     WHERE m.created_at > now() - interval '24 hours'
     GROUP BY u.id, u.username ORDER BY SUM(m.bytes) DESC, u.id LIMIT 5`
  );
  return {
    files: totals.rows[0].files,
    bytes: Number(totals.rows[0].bytes),
    topUploaders: top.rows.map((r) => ({ id: r.id, username: r.username, files: r.files, bytes: Number(r.bytes) }))
  };
}

async function report() {
  const [databaseReport, cloudinaryReport, uploads] = await Promise.all([database(), cloudinaryUsage(), recentUploads()]);
  const warnings = [['database', databaseReport.level], ['cloudinary', cloudinaryReport.level]]
    .filter(([, level]) => level === 'warn' || level === 'alert')
    .map(([source, level]) => ({ source, level }));
  return { database: databaseReport, cloudinary: cloudinaryReport, uploads, warnings, warnAt: WARN_AT, alertAt: ALERT_AT };
}

// For tests: forget the cached Cloudinary answer.
const resetCache = () => { cached = null; };

module.exports = { report, databaseUsage, cloudinaryUsage, levelOf, resetCache, WARN_AT, ALERT_AT };
