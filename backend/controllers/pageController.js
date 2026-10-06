const db = require('../db');
const { escapeLike } = require('../utils/escapeLike');
const { sendServerError } = require('../utils/sendError');
const { mediaOfPage, deleteMedia } = require('../services/mediaCleanupService');
const { getPagination } = require('../utils/pagination');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql } = require('../services/reactionService');

// B14 Pages: business/creator pages, distinct from user accounts.
// - One owner (a user) edits the page and posts as it (POST /posts with
//   pageId). posts.user_id stays the owner, so blocks, ownership checks
//   and account deletion (which cascades to the page) work unchanged.
// - Anyone can follow a page, no approval; page posts are always public
//   and reach followers' home feeds.
// - A page whose owner is deactivated/banned, or who has a block with
//   the viewer (either direction), is hidden from that viewer (404),
//   matching how that owner's own posts are hidden.

const CATEGORIES = ['business', 'creator', 'brand', 'organization', 'community', 'other'];

class PageError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const handle = (res, err, fallback) =>
  err instanceof PageError ? res.status(err.status).send(err.message) : sendServerError(res, err, fallback);

function cleanFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new PageError(400, 'A page needs a name');
    if (name.length > 100) throw new PageError(400, 'Page name must be 100 characters or fewer');
    out.name = name;
  }
  if (!partial || body.description !== undefined) {
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length > 1000) throw new PageError(400, 'Description must be 1000 characters or fewer');
    out.description = description || null;
  }
  if (!partial || body.category !== undefined) {
    const category = body.category === undefined ? 'business' : body.category;
    if (!CATEGORIES.includes(category)) throw new PageError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
    out.category = category;
  }
  return out;
}

// "The viewer ($N) may see pages owned by owner alias u" -- owner active
// (or it's the viewer's own page) and no block either way.
const pageVisibleSql = (viewerParam) => `
  (u.id = ${viewerParam} OR (NOT u.is_deactivated AND (${viewerParam}::int IS NULL OR NOT EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocks.blocker_id = ${viewerParam} AND blocks.blocked_id = u.id)
       OR (blocks.blocker_id = u.id AND blocks.blocked_id = ${viewerParam})
  ))))`;

const PAGE_COLUMNS = `p.id, p.name, p.category, p.description, p.created_at,
  u.id AS owner_id, u.username AS owner_username,
  (SELECT COUNT(*)::int FROM page_follows f WHERE f.page_id = p.id) AS follower_count,
  $2::int IS NOT NULL AND EXISTS(SELECT 1 FROM page_follows f WHERE f.page_id = p.id AND f.user_id = $2) AS is_following,
  p.owner_id = $2 AS is_owner`;

async function loadPage(pageId, viewerId) {
  if (!Number.isInteger(pageId)) throw new PageError(400, 'Invalid page ID');
  const result = await db.query(
    `SELECT ${PAGE_COLUMNS}
     FROM pages p JOIN users u ON u.id = p.owner_id
     WHERE p.id = $1 AND ${pageVisibleSql('$2')}`,
    [pageId, viewerId ?? null]
  );
  if (!result.rows[0]) throw new PageError(404, 'Page not found');
  return { ...result.rows[0], is_owner: Boolean(result.rows[0].is_owner) };
}

async function loadOwnedPage(pageId, viewerId) {
  const page = await loadPage(pageId, viewerId);
  if (!page.is_owner) throw new PageError(403, 'Only the page owner can do that');
  return page;
}

// POST /pages { name, category?, description? }
async function createPage(req, res) {
  try {
    const fields = cleanFields(req.body);
    const result = await db.query(
      'INSERT INTO pages (name, category, description, owner_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [fields.name, fields.category, fields.description, req.userId]
    );
    res.status(201).json(await loadPage(result.rows[0].id, req.userId));
  } catch (err) {
    handle(res, err, 'Creating the page failed. Please try again later.');
  }
}

// GET /pages?q= -> { owned, following, discover }; discover is most-followed first.
async function listPages(req, res) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const result = await db.query(
      `SELECT ${PAGE_COLUMNS}
       FROM pages p JOIN users u ON u.id = p.owner_id
       WHERE ${pageVisibleSql('$2')}
         AND ($1 = '' OR p.name ILIKE '%' || $1 || '%')
       ORDER BY follower_count DESC, p.id DESC
       LIMIT 100`,
      [escapeLike(q), req.userId]
    );
    const rows = result.rows.map((p) => ({ ...p, is_owner: Boolean(p.is_owner) }));
    res.json({
      owned: rows.filter((p) => p.is_owner),
      following: rows.filter((p) => !p.is_owner && p.is_following),
      discover: rows.filter((p) => !p.is_owner && !p.is_following)
    });
  } catch (err) {
    handle(res, err, 'Loading pages failed. Please try again later.');
  }
}

// GET /pages/:id
async function getPage(req, res) {
  try {
    res.json(await loadPage(Number(req.params.id), req.userId));
  } catch (err) {
    handle(res, err, 'Loading the page failed. Please try again later.');
  }
}

// PATCH /pages/:id { name?, category?, description? } -- owner only.
async function updatePage(req, res) {
  try {
    const page = await loadOwnedPage(Number(req.params.id), req.userId);
    const fields = cleanFields(req.body || {}, { partial: true });
    const keys = Object.keys(fields);
    if (keys.length === 0) throw new PageError(400, 'Nothing to update');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await db.query(`UPDATE pages SET ${sets} WHERE id = $1`, [page.id, ...keys.map((k) => fields[k])]);
    res.json(await loadPage(page.id, req.userId));
  } catch (err) {
    handle(res, err, 'Updating the page failed. Please try again later.');
  }
}

// DELETE /pages/:id -- owner only; the page's posts go with it.
async function deletePage(req, res) {
  try {
    const page = await loadOwnedPage(Number(req.params.id), req.userId);
    const media = await mediaOfPage(page.id);
    await db.query('DELETE FROM pages WHERE id = $1', [page.id]);
    deleteMedia(media);
    res.json({ deleted: true });
  } catch (err) {
    handle(res, err, 'Deleting the page failed. Please try again later.');
  }
}

// POST /pages/:id/follow -- idempotent. You can't follow your own page.
async function followPage(req, res) {
  try {
    const page = await loadPage(Number(req.params.id), req.userId);
    if (page.is_owner) throw new PageError(400, "You can't follow your own page");
    await db.query('INSERT INTO page_follows (page_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [page.id, req.userId]);
    res.json(await loadPage(page.id, req.userId));
  } catch (err) {
    handle(res, err, 'Following the page failed. Please try again later.');
  }
}

// DELETE /pages/:id/follow -- idempotent.
async function unfollowPage(req, res) {
  try {
    const pageId = Number(req.params.id);
    if (!Number.isInteger(pageId)) throw new PageError(400, 'Invalid page ID');
    // Unfollowing works even if the page is now hidden from you (e.g. you
    // blocked its owner), so you're never stuck following something.
    await db.query('DELETE FROM page_follows WHERE page_id = $1 AND user_id = $2', [pageId, req.userId]);
    const visible = await loadPage(pageId, req.userId).catch((err) => {
      if (err instanceof PageError && err.status === 404) return null;
      throw err;
    });
    res.json(visible || { id: pageId, is_following: false });
  } catch (err) {
    handle(res, err, 'Unfollowing the page failed. Please try again later.');
  }
}

// GET /pages/:id/posts -- the page's posts, newest first (public).
async function listPagePosts(req, res) {
  try {
    const page = await loadPage(Number(req.params.id), req.userId);
    const { page: pageNum, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });
    const viewerId = req.userId ?? null;
    const result = await db.query(
      `SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, posts.page_id,
         users.id AS user_id, users.username, users.avatar_url,
         $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
         ${reactionColumnsSql('$1')},
         ${mediaColumnSql()},
         ${pageColumnSql()},
         (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
         $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me
       FROM posts
       JOIN users ON users.id = posts.user_id
       WHERE posts.page_id = $4
       ORDER BY posts.created_at DESC
       LIMIT $2 OFFSET $3`,
      [viewerId, limit + 1, offset, page.id]
    );
    const hasMore = result.rows.length > limit;
    res.json({ posts: hasMore ? result.rows.slice(0, limit) : result.rows, currentPage: pageNum, hasMore });
  } catch (err) {
    handle(res, err, 'Loading page posts failed. Please try again later.');
  }
}

module.exports = { CATEGORIES, createPage, listPages, getPage, updatePage, deletePage, followPage, unfollowPage, listPagePosts };
