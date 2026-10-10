// Day 49: spam checks for a new post or comment someone sends now (not a
// scheduled or draft post the ticker publishes at the time its author
// chose, and not edits). Counted from the database, so they hold across
// restarts and server instances:
//
// - flood: more than 10 posts, or 30 comments, in 10 minutes;
// - the same text again: a post identical to one of yours from the last
//   10 minutes, or a comment identical to yours on the same post ("Thanks!"
//   on many posts is normal);
// - the same link: a link already in 3 of your posts and comments in the
//   last hour (same site and path; www., a trailing slash, the query and
//   letter case don't make it a different link).
//
// Off under the automated test suite (Jest sets NODE_ENV=test) unless
// SPAM_CHECKS_IN_TESTS=1, like the bot checks.
const db = require('../db');

const WINDOW_MINUTES = 10;
const MAX_POSTS = 10;
const MAX_COMMENTS = 30;
const LINK_WINDOW_MINUTES = 60;
const MAX_SAME_LINK = 3;
const MAX_LINKS_CHECKED = 5;

const POSTING_TOO_FAST = "You're posting too fast. Please wait a few minutes and try again.";
const COMMENTING_TOO_FAST = "You're commenting too fast. Please wait a few minutes and try again.";
const SAME_POST = 'You just posted this. Try writing something new.';
const SAME_COMMENT = 'You already left this comment on this post.';
const SAME_LINK = "You've shared this link too many times in the last hour. Please try again later.";

class SpamError extends Error {
  constructor(message) {
    super(message);
    this.status = 429;
  }
}

function enabled() {
  return process.env.NODE_ENV !== 'test' || process.env.SPAM_CHECKS_IN_TESTS === '1';
}

// One form for comparing texts: "Hello  World" and "hello world" are the same.
function sameTextKey(text) {
  return String(text).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// The http(s) links in a text as "host/path" (the app links only those --
// frontend utils/links.js), each once.
function linkKeys(text) {
  const keys = new Set();
  for (const match of String(text).matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    let url;
    try {
      url = new URL(match[0].replace(/[.,!?;:'"…)\]}]+$/u, ''));
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = decodeURIComponentSafe(url.pathname).replace(/\/+$/, '').toLowerCase();
    if (host) keys.add(host + path);
    if (keys.size >= MAX_LINKS_CHECKED) break;
  }
  return [...keys];
}

function decodeURIComponentSafe(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// A Postgres regex matching that link in stored text however it was typed:
// http or https, with or without www., any case, any query, a trailing
// slash or not -- but not a longer path ("site.com/a" isn't "site.com/ab").
function linkPattern(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `https?://(www\\.)?${escaped}/?(?![a-z0-9._~%/-])`;
}

async function checkLinks(userId, content) {
  for (const key of linkKeys(content)) {
    const result = await db.query(
      `SELECT (SELECT COUNT(*) FROM posts WHERE user_id = $1 AND created_at > now() - make_interval(mins => $3) AND content ~* $2)
            + (SELECT COUNT(*) FROM comments WHERE user_id = $1 AND created_at > now() - make_interval(mins => $3) AND content ~* $2) AS uses`,
      [userId, linkPattern(key), LINK_WINDOW_MINUTES]
    );
    if (Number(result.rows[0].uses) >= MAX_SAME_LINK) throw new SpamError(SAME_LINK);
  }
}

// Throws a SpamError (429) when this new post would be spam.
async function checkPost(userId, content) {
  if (!enabled()) return;
  const recent = await db.query(
    `SELECT content FROM posts WHERE user_id = $1 AND created_at > now() - make_interval(mins => $2)
     ORDER BY created_at DESC LIMIT $3`,
    [userId, WINDOW_MINUTES, MAX_POSTS]
  );
  if (recent.rows.length >= MAX_POSTS) throw new SpamError(POSTING_TOO_FAST);
  const key = sameTextKey(content);
  if (recent.rows.some((r) => sameTextKey(r.content) === key)) throw new SpamError(SAME_POST);
  await checkLinks(userId, content);
}

// Throws a SpamError (429) when this new comment on `postId` would be spam.
async function checkComment(userId, postId, content) {
  if (!enabled()) return;
  const recent = await db.query(
    `SELECT post_id, content FROM comments WHERE user_id = $1 AND created_at > now() - make_interval(mins => $2)
     ORDER BY created_at DESC LIMIT $3`,
    [userId, WINDOW_MINUTES, MAX_COMMENTS]
  );
  if (recent.rows.length >= MAX_COMMENTS) throw new SpamError(COMMENTING_TOO_FAST);
  const key = sameTextKey(content);
  if (recent.rows.some((r) => r.post_id === Number(postId) && sameTextKey(r.content) === key)) throw new SpamError(SAME_COMMENT);
  await checkLinks(userId, content);
}

module.exports = { checkPost, checkComment, SpamError, linkKeys, linkPattern, MAX_POSTS, MAX_COMMENTS, MAX_SAME_LINK };
