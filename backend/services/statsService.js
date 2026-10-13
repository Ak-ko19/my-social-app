// Day 61: Admin > Overview -- how the app is doing. What happened each
// finished day (signups, posts, comments, reports; days are UTC) is
// counted once into daily_stats by rollUp(), which the ticker runs; today
// is counted live. Totals of the big tables come from Postgres' own row
// estimate once they are large, so the page never counts millions of
// rows on every visit.
const db = require('../db');
const storageService = require('./storageService');

const RANGES = [7, 30, 90];
// The first roll-up (an empty table) goes this far back.
const BACKFILL_DAYS = 90;
// Below this many rows a table is counted exactly (it's cheap).
const ESTIMATE_FROM = 10000;
// metric -> the table whose created_at it counts.
const METRICS = { signups: 'users', posts: 'posts', comments: 'comments', reports: 'reports' };
const NAMES = Object.keys(METRICS);
// created_at is a plain timestamp on older tables (the server's time zone)
// and timestamptz on newer ones; ::timestamptz reads both correctly.
const UTC_DAY = "((created_at::timestamptz) AT TIME ZONE 'UTC')::date";
const TODAY = "(now() AT TIME ZONE 'UTC')::date";
const startOf = (day) => `(${day}::timestamp AT TIME ZONE 'UTC')`;

// Counts every finished day not yet in daily_stats (all of them on the
// first run, BACKFILL_DAYS back), one grouped query per table over the
// whole missing range. Safe to run anywhere, any number of times: a day
// someone else has already written is left alone.
async function rollUp() {
  const counted = NAMES.map((name) => `${name} AS (
      SELECT ${UTC_DAY} AS day, count(*)::int AS n FROM ${METRICS[name]}, bounds
      WHERE created_at >= ${startOf('bounds.first_day')} AND created_at < ${startOf('bounds.today')}
      GROUP BY 1
    )`).join(',\n    ');
  const result = await db.query(
    `WITH bounds AS (
      SELECT COALESCE(max(day) + 1, ${TODAY} - $1::int) AS first_day, ${TODAY} AS today FROM daily_stats
    ),
    days AS (
      SELECT generate_series(first_day, today - 1, interval '1 day')::date AS day FROM bounds
    ),
    ${counted}
    INSERT INTO daily_stats (day, ${NAMES.join(', ')})
    SELECT days.day, ${NAMES.map((name) => `COALESCE(${name}.n, 0)`).join(', ')}
    FROM days ${NAMES.map((name) => `LEFT JOIN ${name} USING (day)`).join(' ')}
    ON CONFLICT (day) DO NOTHING
    RETURNING day`,
    [BACKFILL_DAYS]
  );
  return { days: result.rowCount };
}

// Today so far, live: one indexed range count per table.
async function today() {
  const parts = NAMES.map((name) => `(SELECT count(*)::int FROM ${METRICS[name]} WHERE created_at >= ${startOf(TODAY)}) AS ${name}`);
  const { rows } = await db.query(`SELECT ${TODAY}::text AS day, ${parts.join(', ')}`);
  return rows[0];
}

// Rows in users, posts and comments: exact while small, Postgres'
// estimate (from its last ANALYZE) after that.
async function totals() {
  const estimates = await db.query(
    `SELECT relname, reltuples::bigint AS rows FROM pg_class
     WHERE relkind = 'r' AND relname = ANY($1) AND relnamespace = 'public'::regnamespace`,
    [['users', 'posts', 'comments']]
  );
  const estimateOf = Object.fromEntries(estimates.rows.map((r) => [r.relname, Number(r.rows)]));
  const out = {};
  for (const table of ['users', 'posts', 'comments']) {
    const estimate = estimateOf[table] ?? -1;
    if (estimate >= module.exports.ESTIMATE_FROM) { // read here so a test can lower it
      out[table] = { count: estimate, estimated: true };
    } else {
      const exact = await db.query(`SELECT count(*)::int AS n FROM ${table}`);
      out[table] = { count: exact.rows[0].n, estimated: false };
    }
  }
  const small = await db.query(
    `SELECT (SELECT count(*)::int FROM communities) AS groups,
            (SELECT count(*)::int FROM pages) AS pages,
            (SELECT count(*)::int FROM reports WHERE status = 'pending') AS pending_reports,
            (SELECT count(*)::int FROM error_groups WHERE resolved_at IS NULL) AS open_errors`
  );
  const s = small.rows[0];
  return { ...out, groups: s.groups, pages: s.pages, pendingReports: s.pending_reports, openErrors: s.open_errors };
}

// GET /admin/overview?days=7|30|90: one point per day (oldest first, today
// last), the totals, and how full storage is.
async function overview(days) {
  await rollUp(); // nothing to do (one indexed max()) when it's up to date
  const past = await db.query(
    `SELECT day::text AS day, ${NAMES.join(', ')} FROM daily_stats
     WHERE day >= ${TODAY} - ($1::int - 1) AND day < ${TODAY} ORDER BY day`,
    [days]
  );
  const [now, total, database, cloudinary] = await Promise.all([
    today(),
    totals(),
    storageService.databaseUsage(),
    storageService.cloudinaryUsage()
  ]);
  return {
    days,
    series: [...past.rows, now],
    totals: total,
    storage: {
      database: { percent: database.percent, level: database.level },
      cloudinary: { percent: cloudinary.percent ?? null, level: cloudinary.level }
    }
  };
}

module.exports = { rollUp, overview, RANGES, BACKFILL_DAYS, ESTIMATE_FROM };
