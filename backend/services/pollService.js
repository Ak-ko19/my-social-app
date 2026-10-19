// Day 44: poll posts, like X/Facebook/LinkedIn (migration 050). The post's
// text is the question. A poll has 2-4 options and closes at a set time;
// each person votes once and can't change it. Votes are anonymous: only
// counts are ever returned, and the per-option counts only to someone who
// may see the results (they voted, it's their poll, or it has ended), so
// the numbers can't sway a vote.
const { HttpError } = require('../utils/httpError');
const db = require('../db');
const { toUnicode } = require('../utils/myanmarText');

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_LABEL_LENGTH = 50; // poll_options.label is varchar(50)
const DURATION_HOURS = [24, 72, 168]; // 1 day, 3 days, 1 week
const DEFAULT_DURATION_HOURS = 24;

class PollError extends HttpError {}

// The `poll` field of POST /posts: absent (no poll), or { options:
// [labels], durationHours } -- a JSON string when the post is sent as a
// form (multipart). Returns null or { labels, durationHours }; throws a
// PollError(400) when it's not a valid poll.
function parsePollInput(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  let poll = raw;
  if (typeof raw === 'string') {
    try {
      poll = JSON.parse(raw);
    } catch {
      throw new PollError(400, 'Invalid poll');
    }
  }
  if (!poll || typeof poll !== 'object' || !Array.isArray(poll.options)) throw new PollError(400, 'Invalid poll');
  if (poll.options.length < MIN_OPTIONS || poll.options.length > MAX_OPTIONS) {
    throw new PollError(400, `A poll needs ${MIN_OPTIONS} to ${MAX_OPTIONS} options`);
  }
  const labels = poll.options.map((option) => {
    if (typeof option !== 'string') throw new PollError(400, 'Invalid poll');
    // Day 43: Zawgyi Myanmar text is stored as Unicode (utils/myanmarText).
    // The column holds 50 characters, so the converted text is measured.
    const label = toUnicode(option.trim());
    if (!label) throw new PollError(400, 'Poll options cannot be empty');
    if (label.length > MAX_LABEL_LENGTH) throw new PollError(400, `Poll options must be ${MAX_LABEL_LENGTH} characters or fewer`);
    return label;
  });
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
    throw new PollError(400, 'Poll options must be different');
  }
  const durationHours = poll.durationHours ?? DEFAULT_DURATION_HOURS;
  if (!DURATION_HOURS.includes(durationHours)) {
    throw new PollError(400, `Poll length must be one of: ${DURATION_HOURS.join(', ')} hours`);
  }
  return { labels, durationHours };
}

// A post's poll for one viewer, or null -- injected into every post
// listing next to mediaColumnSql (the posts table aliased as "posts").
// { closes_at, closed, total_votes, my_vote (option id or null),
//   show_results, options: [{ id, label, votes (null unless
//   show_results) }] }
function pollColumnSql(viewerParam) {
  return `
    (SELECT json_build_object(
       'closes_at', pl.closes_at,
       'closed', st.closed,
       'total_votes', st.total_votes,
       'my_vote', st.my_vote,
       'show_results', sh.show_results,
       'options', (SELECT json_agg(json_build_object(
           'id', o.id,
           'label', o.label,
           'votes', CASE WHEN sh.show_results THEN (SELECT COUNT(*)::int FROM poll_votes v WHERE v.option_id = o.id) END
         ) ORDER BY o.position)
         FROM poll_options o WHERE o.post_id = pl.post_id))
     FROM polls pl
     CROSS JOIN LATERAL (SELECT
         pl.closes_at <= now() AS closed,
         (SELECT COUNT(*)::int FROM poll_votes v WHERE v.post_id = pl.post_id) AS total_votes,
         (SELECT v.option_id FROM poll_votes v WHERE v.post_id = pl.post_id AND v.user_id = ${viewerParam}) AS my_vote
       ) st
     CROSS JOIN LATERAL (SELECT
         st.closed OR st.my_vote IS NOT NULL OR COALESCE(posts.user_id = ${viewerParam}, false) AS show_results
       ) sh
     WHERE pl.post_id = posts.id
    ) AS poll`;
}

async function getPoll(postId, viewerId) {
  const result = await db.query(`SELECT ${pollColumnSql('$2::int')} FROM posts WHERE posts.id = $1`, [postId, viewerId ?? null]);
  return result.rows[0]?.poll ?? null;
}

// Casts the viewer's vote. The caller has already checked they may see
// the post. Returns { created, poll }: created is false when they had
// already cast this same vote (a double tap) -- a different one is
// refused, since a vote can't be changed.
async function vote(postId, userId, optionId) {
  const pollResult = await db.query('SELECT 1 FROM polls WHERE post_id = $1', [postId]);
  if (pollResult.rows.length === 0) throw new PollError(404, 'This post has no poll');
  if (!Number.isInteger(optionId)) throw new PollError(400, 'Invalid option');
  const option = await db.query('SELECT 1 FROM poll_options WHERE id = $1 AND post_id = $2', [optionId, postId]);
  if (option.rows.length === 0) throw new PollError(400, 'Invalid option');

  // Open-poll check inside the insert, so a vote can't land after the
  // poll has closed, however close to the end it was sent.
  const inserted = await db.query(
    `INSERT INTO poll_votes (post_id, user_id, option_id)
     SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM polls WHERE post_id = $1 AND closes_at > now())
     ON CONFLICT (post_id, user_id) DO NOTHING
     RETURNING option_id`,
    [postId, userId, optionId]
  );
  if (inserted.rows.length === 0) {
    const existing = await db.query('SELECT option_id FROM poll_votes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
    if (existing.rows.length === 0) throw new PollError(409, 'This poll has ended');
    if (existing.rows[0].option_id !== optionId) throw new PollError(409, 'You already voted in this poll');
    return { created: false, poll: await getPoll(postId, userId) };
  }
  return { created: true, poll: await getPoll(postId, userId) };
}

module.exports = {
  PollError,
  parsePollInput,
  pollColumnSql,
  getPoll,
  vote,
  MIN_OPTIONS,
  MAX_OPTIONS,
  MAX_LABEL_LENGTH,
  DURATION_HOURS
};
