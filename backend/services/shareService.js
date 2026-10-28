// Days 93-94: sharing someone's post to your own feed, with your own words
// (Facebook's "Share"). A share is a post of its own (posts.is_share) that
// points at the original (posts.shared_post_id, NULL once it's deleted).
//
// Only a post ANYONE may see can be shared, and a share shows its original
// only while that is still true (or the viewer wrote it) -- so sharing never
// carries a post past its audience: a later "followers only", a delete, a
// block or a deactivated author turns the card into "This content isn't
// available right now", like Facebook's.
const db = require('../db');
const { HttpError } = require('../utils/httpError');
const { noBlockBetweenSql } = require('./blockService');
const { getVisiblePost } = require('./postVisibilityService');
const postCreation = require('./postCreationService');
const notificationService = require('./notificationService');

class ShareError extends HttpError {}
const NOT_SHAREABLE = 'Only posts that everyone can see can be shared.';
const NOT_FOUND = 'Post not found';

// SQL condition "post p (author u) is open to everyone": a public post of a
// public account, a page's post, or a post in a public group -- by an active
// author. The same as a logged-out reader's view (getVisiblePost with no
// viewer), written once for the share rules.
function openToEveryoneSql(p, u) {
  return `(NOT ${u}.is_deactivated AND ${p}.visibility = 'public' AND (
    (${p}.community_id IS NULL AND (${p}.page_id IS NOT NULL OR NOT ${u}.is_private))
    OR EXISTS (SELECT 1 FROM communities sco WHERE sco.id = ${p}.community_id AND sco.privacy = 'public')
  ))`;
}

// The original as a share shows it to viewer $N: open to everyone or the
// viewer's own, no block between them.
function originalVisibleSql(viewer, p = 'op', u = 'ou') {
  return `((${openToEveryoneSql(p, u)} OR ${p}.user_id = ${viewer}::int)
    AND (${viewer}::int IS NULL OR ${noBlockBetweenSql(`${viewer}::int`, `${p}.user_id`)}))`;
}

// The columns every post listing adds (next to pollColumnSql), for the
// posts row aliased "posts" and viewer $N:
//   is_share, shared_post (the original's card, or null when it isn't
//   available to this viewer), share_count, can_share (the Share button).
function shareColumnsSql(viewer) {
  return `
    posts.is_share,
    (SELECT json_build_object(
        -- posts.created_at has no zone (the database's local time): made a
        -- real instant, so the card's time reads like every other post's.
        'id', op.id, 'content', op.content, 'created_at', op.created_at AT TIME ZONE current_setting('TimeZone'),
        'user_id', ou.id, 'username', ou.username, 'avatar_url', ou.avatar_url,
        'page', (SELECT json_build_object('id', pg.id, 'name', pg.name, 'verified', pg.verified_at IS NOT NULL) FROM pages pg WHERE pg.id = op.page_id),
        'media', (SELECT COALESCE(json_agg(json_build_object('url', pm.url, 'alt', pm.alt_text) ORDER BY pm.position), '[]'::json)
                  FROM post_media pm WHERE pm.post_id = op.id))
     FROM posts op JOIN users ou ON ou.id = op.user_id
     WHERE op.id = posts.shared_post_id AND ${originalVisibleSql(viewer)}) AS shared_post,
    (SELECT COUNT(*)::int FROM posts sh WHERE sh.shared_post_id = posts.id) AS share_count,
    -- Scalar subqueries, one indexed row each: as an EXISTS over
    -- "posts" Postgres may hash the whole table first (the perf suite
    -- caught that on /feed).
    CASE WHEN posts.is_share
      THEN COALESCE((SELECT true FROM posts cs JOIN users cu ON cu.id = cs.user_id
        WHERE cs.id = posts.shared_post_id AND ${openToEveryoneSql('cs', 'cu')}
          AND (${viewer}::int IS NULL OR ${noBlockBetweenSql(`${viewer}::int`, 'cs.user_id')})), false)
      ELSE COALESCE((SELECT true FROM users cu
        WHERE cu.id = posts.user_id AND ${openToEveryoneSql('posts', 'cu')}
          AND (${viewer}::int IS NULL OR ${noBlockBetweenSql(`${viewer}::int`, 'posts.user_id')})), false)
    END AS can_share`;
}

// POST /posts/:id/share -- `userId` shares post `postId` (sharing a share
// shares its original, like Facebook) with optional words and an audience.
// Returns the new post row, or throws a ShareError / PostInputError.
async function share(userId, postId, body) {
  const target = (await db.query('SELECT id, is_share, shared_post_id FROM posts WHERE id = $1', [postId])).rows[0];
  // You must be able to see what you share (404 otherwise, like a post).
  if (!target || !(await getVisiblePost(target.id, userId))) throw new ShareError(404, NOT_FOUND);
  const originalId = target.is_share ? target.shared_post_id : target.id;
  if (originalId === null) throw new ShareError(403, NOT_SHAREABLE);
  const original = (await db.query(
    `SELECT op.id, op.user_id FROM posts op JOIN users ou ON ou.id = op.user_id
     WHERE op.id = $1 AND ${openToEveryoneSql('op', 'ou')} AND ${noBlockBetweenSql('$2::int', 'op.user_id')}`,
    [originalId, userId]
  )).rows[0];
  if (!original) throw new ShareError(403, NOT_SHAREABLE);

  // The share's own words (may be empty) and audience; a share has no
  // photos or poll, and lives on your own profile (not a group or page).
  const fields = postCreation.readPostFields({ content: body.content, visibility: body.visibility }, { allowEmpty: true });
  const row = await postCreation.insertPost(db, userId, { ...fields, poll: null, communityId: null, pageId: null, sharedPostId: original.id }, []);
  const created = await postCreation.finishPost(row, userId, { poll: null }, []);
  await notificationService.notify({ userId: original.user_id, actorId: userId, type: 'share', postId: original.id });
  return created;
}

module.exports = { share, shareColumnsSql, openToEveryoneSql, ShareError, NOT_SHAREABLE };
