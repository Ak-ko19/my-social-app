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
const { HttpError } = require('../utils/httpError');

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

// Day 102: an account's first day is held back further, the way Facebook
// and Instagram do it -- most spam accounts are used the day they are
// made. Admins never are. These come on top of the limits above.
const NEW_ACCOUNT_HOURS = 24;
const NEW_MAX_POSTS = 3; // in WINDOW_MINUTES
const NEW_MAX_COMMENTS = 10; // in WINDOW_MINUTES
const NEW_MAX_LINK_ITEMS = 3; // posts and comments with any link, in LINK_WINDOW_MINUTES
const NEW_MAX_FOLLOWS = 20; // an hour
const NEW_MAX_STRANGERS = 5; // people a day who don't follow you and haven't written to you

const NEW_POSTING = 'New accounts can only post a few times in a short while. Please wait a few minutes and try again.';
const NEW_COMMENTING = 'New accounts can only comment a few times in a short while. Please wait a few minutes and try again.';
const NEW_LINKS = 'New accounts can only share a few links an hour. Please try again later.';
const NEW_FOLLOWS = 'New accounts can follow up to 20 people an hour. Please try again later.';
const NEW_STRANGERS = "New accounts can message up to 5 people who don't follow them in their first day. Please try again tomorrow.";

class SpamError extends HttpError {
  constructor(message) {
    super(429, message);
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
  // Days 93-94: a share with no words of its own isn't "the same post
  // again" (two shares of different posts are both empty).
  const key = sameTextKey(content);
  if (content.trim() !== '' && recent.rows.some((r) => sameTextKey(r.content) === key)) throw new SpamError(SAME_POST);
  await checkLinks(userId, content);
  if (await isNewAccount(userId)) {
    if (recent.rows.length >= NEW_MAX_POSTS) throw new SpamError(NEW_POSTING);
    await checkNewAccountLinks(userId, content);
  }
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
  if (await isNewAccount(userId)) {
    if (recent.rows.length >= NEW_MAX_COMMENTS) throw new SpamError(NEW_COMMENTING);
    await checkNewAccountLinks(userId, content);
  }
}

// Day 102: made in the last day, and not an admin.
async function isNewAccount(userId) {
  const result = await db.query(
    'SELECT created_at > now() - make_interval(hours => $2) AND NOT is_admin AS is_new FROM users WHERE id = $1',
    [userId, NEW_ACCOUNT_HOURS]
  );
  return Boolean(result.rows[0]?.is_new);
}

// Day 102: a new account's posts and comments with any link, per hour.
async function checkNewAccountLinks(userId, content) {
  if (linkKeys(content).length === 0) return;
  const result = await db.query(
    `SELECT (SELECT COUNT(*) FROM posts WHERE user_id = $1 AND created_at > now() - make_interval(mins => $2) AND content ~* 'https?://')
          + (SELECT COUNT(*) FROM comments WHERE user_id = $1 AND created_at > now() - make_interval(mins => $2) AND content ~* 'https?://') AS uses`,
    [userId, LINK_WINDOW_MINUTES]
  );
  if (Number(result.rows[0].uses) >= NEW_MAX_LINK_ITEMS) throw new SpamError(NEW_LINKS);
}

// Day 102: before a new account follows someone (or asks to).
async function checkFollow(userId) {
  if (!enabled() || !(await isNewAccount(userId))) return;
  const result = await db.query(
    "SELECT COUNT(*)::int AS n FROM follows WHERE follower_id = $1 AND created_at > now() - interval '1 hour'",
    [userId]
  );
  if (result.rows[0].n >= NEW_MAX_FOLLOWS) throw new SpamError(NEW_FOLLOWS);
}

// Day 102: before a new account's message in direct chat `conversationId`.
// A stranger is someone who doesn't follow you and hasn't written to you
// in that chat; a new account can write to NEW_MAX_STRANGERS of them a
// day (a chat already counted goes on). Group chats don't count.
async function checkMessage(conversationId, senderId) {
  if (!enabled() || !(await isNewAccount(senderId))) return;
  const result = await db.query(
    `WITH chats AS (
       SELECT c.id, CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END AS other
       FROM conversations c
       WHERE c.type = 'direct' AND (c.user_a_id = $1 OR c.user_b_id = $1)
     ),
     strangers AS (
       SELECT chats.id FROM chats
       WHERE NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = chats.other AND f.following_id = $1 AND f.status = 'accepted')
         AND NOT EXISTS (SELECT 1 FROM messages w WHERE w.conversation_id = chats.id AND w.sender_id = chats.other)
     )
     SELECT EXISTS (SELECT 1 FROM strangers WHERE id = $2) AS to_stranger,
            (SELECT COUNT(*)::int FROM strangers s WHERE s.id <> $2 AND EXISTS (
               SELECT 1 FROM messages m WHERE m.conversation_id = s.id AND m.sender_id = $1 AND m.created_at > now() - interval '1 day'
             )) AS others`,
    [senderId, conversationId]
  );
  const { to_stranger: toStranger, others } = result.rows[0];
  if (toStranger && others >= NEW_MAX_STRANGERS) throw new SpamError(NEW_STRANGERS);
}

module.exports = {
  checkPost,
  checkComment,
  checkFollow,
  checkMessage,
  SpamError,
  linkKeys,
  linkPattern,
  MAX_POSTS,
  MAX_COMMENTS,
  MAX_SAME_LINK,
  NEW_MAX_POSTS,
  NEW_MAX_COMMENTS,
  NEW_MAX_LINK_ITEMS,
  NEW_MAX_FOLLOWS,
  NEW_MAX_STRANGERS
};
