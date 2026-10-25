const db = require('../db');
const { sendError } = require('../utils/httpError');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql } = require('../services/reactionService');
const { pollColumnSql } = require('../services/pollService');
const { validZone, todayIn } = require('../utils/timeZone');

// Days 83-84: Memories, like Facebook's "On this day" -- your own posts
// made on today's date in earlier years. "Today" is the viewer's own date:
// the app sends its time zone (IANA name), and each post's date is read in
// that zone. posts.created_at has no zone of its own: it holds the
// database's local time (its TimeZone setting -- UTC on the host), so it
// is placed in that zone first, then read in the viewer's. Only profile posts (not ones in groups or as a page), like
// the profile's Posts tab; only you see them here, whatever their
// audience.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(text) {
  if (!DATE_RE.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

// GET /memories?tz=&date= -> { date, memories: [{ yearsAgo, year, posts }] }
async function getMemories(req, res) {
  try {
    const tz = req.query.tz === undefined ? 'UTC' : String(req.query.tz);
    if (!validZone(tz)) return res.status(400).send('tz must be a time zone name such as Europe/London');
    const date = req.query.date === undefined ? todayIn(tz) : String(req.query.date);
    if (!validDate(date)) return res.status(400).send('date must be YYYY-MM-DD');
    const [year, month, day] = date.split('-').map(Number);
    // Feb 29 posts come back on Feb 28 when this year has no Feb 29.
    const alsoLeapDay = month === 2 && day === 28 && !isLeap(year);

    const result = await db.query(`
      SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
        EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
        ${reactionColumnsSql('$1')},
        ${mediaColumnSql()},
        ${pollColumnSql('$1')},
        ${pageColumnSql()},
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
        EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me,
        $5::int - extract(year FROM (posts.created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $2)::int AS years_ago
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.user_id = $1 AND posts.page_id IS NULL AND posts.community_id IS NULL
        AND extract(year FROM (posts.created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $2) < $5
        AND (
          (extract(month FROM (posts.created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $2) = $3 AND extract(day FROM (posts.created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $2) = $4)
          OR ($6::boolean AND extract(month FROM (posts.created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $2) = 2 AND extract(day FROM (posts.created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $2) = 29)
        )
      ORDER BY posts.created_at DESC
      LIMIT 100
    `, [req.userId, tz, month, day, year, alsoLeapDay]);

    const byYear = new Map();
    for (const { years_ago: yearsAgo, ...post } of result.rows) {
      if (!byYear.has(yearsAgo)) byYear.set(yearsAgo, { yearsAgo, year: year - yearsAgo, posts: [] });
      byYear.get(yearsAgo).posts.push(post);
    }
    res.json({ date, memories: [...byYear.values()].sort((a, b) => a.yearsAgo - b.yearsAgo) });
  } catch (err) {
    // A zone Intl knows but Postgres doesn't.
    if (err.code === '22023') return res.status(400).send('tz must be a time zone name such as Europe/London');
    sendError(res, err, 'Loading memories failed. Please try again later.');
  }
}

module.exports = { getMemories };
