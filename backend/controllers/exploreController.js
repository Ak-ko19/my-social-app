const db = require('../db');
const { noBlockBetweenSql } = require('../services/blockService');
const { postAudienceSql } = require('../services/postVisibilityService');
const { notMutedSql } = require('../services/muteService');
const { sendError } = require('../utils/httpError');
const { getPagination } = require('../utils/pagination');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql, commentCountColumnSql } = require('../services/reactionService');
const { shareColumnsSql } = require('../services/shareService');
const { pollColumnSql } = require('../services/pollService');
const { popularityScoreSql } = require('../services/popularity');

// B7 Explore. Both lists look at the last EXPLORE_WINDOW of activity.
const EXPLORE_WINDOW = "INTERVAL '7 days'";

// A post anyone may see: public account, public post (B5), author active.
// Trending counts use ONLY these, so a trend can never reveal activity in
// private or followers-only posts -- not even as a number.
const PUBLICLY_VISIBLE_SQL = `
  (NOT users.is_private OR posts.page_id IS NOT NULL) AND posts.visibility = 'public' AND NOT users.is_deactivated`;

// Hides authors the viewer ($1) has a block with, either direction.
const NOT_BLOCKED_SQL = `
  ($1::int IS NULL OR ${noBlockBetweenSql('$1', 'posts.user_id')})`;

// The most-used tags in the window, by how many distinct (publicly
// visible) posts used them; ties go to the most recently used. At most 10.
// viewerId null = nobody's blocks are hidden.
async function queryTrending(viewerId) {
  const result = await db.query(
    `SELECT hashtags.tag, COUNT(DISTINCT posts.id)::int AS post_count, MAX(posts.created_at) AS last_used_at
     FROM posts
     JOIN users ON users.id = posts.user_id
     -- Day 42: each recent post's tags, looked up by post. OFFSET 0 keeps
     -- Postgres from turning this into a plain join, which it plans as a
     -- read of ALL of post_hashtags whenever the table hasn't been vacuumed
     -- lately -- a cost that grows with every tag ever used, not with the
     -- week's posts.
     CROSS JOIN LATERAL (
       SELECT post_hashtags.hashtag_id FROM post_hashtags WHERE post_hashtags.post_id = posts.id OFFSET 0
     ) tagged
     JOIN hashtags ON hashtags.id = tagged.hashtag_id
     WHERE posts.community_id IS NULL -- B13: not in global explore
       AND posts.created_at > now() - ${EXPLORE_WINDOW}
       AND ${PUBLICLY_VISIBLE_SQL}
       AND ${NOT_BLOCKED_SQL}
     GROUP BY hashtags.id, hashtags.tag
     ORDER BY post_count DESC, last_used_at DESC
     LIMIT 10`,
    [viewerId]
  );
  return result.rows.map(({ tag, post_count }) => ({ tag, post_count }));
}

// Day 40 (audit N3): counting a week of tagged posts on every request
// grows with weekly volume, so the list everyone shares is cached in memory
// for TRENDING_TTL_MS -- trends move over hours, a minute's delay is fine
// (X refreshes them every few minutes). A table refreshed by the daily
// cleanup job would be up to a day stale. Concurrent misses share one
// query; a failed query is not cached. Off under NODE_ENV=test (browser
// suites post a tag and check Explore at once) unless TRENDING_CACHE_MS is
// set, like the bot checks.
const TRENDING_TTL_MS = 60 * 1000;
let sharedTrending = null; // { expires, promise }

function trendingTtlMs() {
  if (process.env.TRENDING_CACHE_MS !== undefined) return Number(process.env.TRENDING_CACHE_MS);
  return process.env.NODE_ENV === 'test' ? 0 : TRENDING_TTL_MS;
}

function getSharedTrending() {
  const now = Date.now();
  if (sharedTrending && sharedTrending.expires > now) return sharedTrending.promise;
  const ttl = trendingTtlMs();
  const entry = { expires: now + ttl, promise: queryTrending(null) };
  if (ttl > 0) {
    sharedTrending = entry;
    entry.promise.catch(() => { if (sharedTrending === entry) sharedTrending = null; });
  }
  return entry.promise;
}

function clearTrendingCache() {
  sharedTrending = null;
}

// Whether a block hides anyone from this viewer (either direction). Only
// then does their trending list differ from the shared one.
async function hasBlocks(viewerId) {
  const result = await db.query(
    `SELECT EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $1)
         OR EXISTS (SELECT 1 FROM blocks WHERE blocked_id = $1) AS has_blocks`,
    [viewerId]
  );
  return result.rows[0].has_blocks;
}

// GET /explore/hashtags -- shared (cached) for visitors and for people
// with no blocks, which is nearly everyone; worked out live for the rest,
// so a blocked author's posts never count towards their trends.
async function getTrendingHashtags(req, res) {
  try {
    const viewerId = req.userId ?? null;
    const tags = viewerId !== null && await hasBlocks(viewerId) ? await queryTrending(viewerId) : await getSharedTrending();
    res.json(tags);
  } catch (err) {
    sendError(res, err, 'Loading trending hashtags failed. Please try again later.');
  }
}

// GET /explore/posts -- popular recent posts the viewer can see, ranked by
// engagement with time decay (services/popularity.js). Only posts with at
// least one reaction or comment qualify ("popular", not "recent").
async function getPopularPosts(req, res) {
  try {
    const viewerId = req.userId ?? null;
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 30 });
    const result = await db.query(
      `WITH scored AS (
         SELECT posts.id,
           (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) AS reactions,
           (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND NOT comments.awaiting_approval) AS comment_total
         FROM posts
         JOIN users ON users.id = posts.user_id
         WHERE posts.community_id IS NULL -- B13: not in global explore
         AND posts.created_at > now() - ${EXPLORE_WINDOW}
           AND ${NOT_BLOCKED_SQL}
           AND NOT users.is_deactivated
           -- Day 47: not from people the viewer muted.
           AND ($1::int IS NULL OR ${notMutedSql('$1', 'posts.user_id', 'posts.page_id')})
           AND ${postAudienceSql('$1')}
       )
       SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
         $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
         ${reactionColumnsSql('$1')},
         ${mediaColumnSql()},
         ${pollColumnSql('$1')},
         ${commentCountColumnSql('$1')},
         ${shareColumnsSql('$1')},
        ${pageColumnSql()},
         scored.reactions::int AS like_count,
         scored.comment_total::int AS comment_count,
         $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me,
         ${popularityScoreSql('scored.reactions', 'scored.comment_total', 'posts.created_at')} AS score
       FROM scored
       JOIN posts ON posts.id = scored.id
       JOIN users ON users.id = posts.user_id
       WHERE scored.reactions + scored.comment_total > 0
       ORDER BY score DESC, posts.created_at DESC
       LIMIT $2 OFFSET $3`,
      [viewerId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    const posts = (hasMore ? result.rows.slice(0, limit) : result.rows).map(({ score, ...post }) => post);
    res.json({ posts, currentPage: page, hasMore });
  } catch (err) {
    sendError(res, err, 'Loading popular posts failed. Please try again later.');
  }
}

module.exports = { getTrendingHashtags, getPopularPosts, clearTrendingCache, TRENDING_TTL_MS };
