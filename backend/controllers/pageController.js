const { HttpError, sendError } = require('../utils/httpError');
const { noBlockBetweenSql } = require('../services/blockService');
const db = require('../db');
const { escapeLike } = require('../utils/escapeLike');
const { mediaOfPage, deleteMedia } = require('../services/mediaCleanupService');
const { getPagination } = require('../utils/pagination');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql } = require('../services/reactionService');
const { pollColumnSql } = require('../services/pollService');
const { toUnicode } = require('../utils/myanmarText'); // Day 43: Zawgyi -> Unicode
const { MAX_ADMINS } = require('../services/pageAdminService');
const notificationService = require('../services/notificationService');

// B14 Pages: business/creator pages, distinct from user accounts.
// - One owner (a user) edits the page and posts as it (POST /posts with
//   pageId). Day 53: so do the admins the owner adds (page_admins). posts.user_id stays the owner, so blocks, ownership checks
//   and account deletion (which cascades to the page) work unchanged.
// - Anyone can follow a page, no approval; page posts are always public
//   and reach followers' home feeds.
// - A page whose owner is deactivated/banned, or who has a block with
//   the viewer (either direction), is hidden from that viewer (404),
//   matching how that owner's own posts are hidden.

const CATEGORIES = ['business', 'creator', 'brand', 'organization', 'community', 'other'];

class PageError extends HttpError {}

function cleanFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? toUnicode(body.name).trim() : '';
    if (!name) throw new PageError(400, 'A page needs a name');
    if (name.length > 100) throw new PageError(400, 'Page name must be 100 characters or fewer');
    out.name = name;
  }
  if (!partial || body.description !== undefined) {
    const description = typeof body.description === 'string' ? toUnicode(body.description).trim() : '';
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
  (u.id = ${viewerParam} OR (NOT u.is_deactivated AND (${viewerParam}::int IS NULL OR ${noBlockBetweenSql(`${viewerParam}`, 'u.id')})))`;

const PAGE_COLUMNS = `p.id, p.name, p.category, p.description, p.created_at,
  u.id AS owner_id, u.username AS owner_username,
  (SELECT COUNT(*)::int FROM page_follows f WHERE f.page_id = p.id) AS follower_count,
  $2::int IS NOT NULL AND EXISTS(SELECT 1 FROM page_follows f WHERE f.page_id = p.id AND f.user_id = $2) AS is_following,
  p.owner_id = $2 AS is_owner,
  -- Day 53: the owner or one of the page's admins.
  (p.owner_id = $2 OR EXISTS(SELECT 1 FROM page_admins pa WHERE pa.page_id = p.id AND pa.user_id = $2)) AS is_admin`;

async function loadPage(pageId, viewerId) {
  if (!Number.isInteger(pageId)) throw new PageError(400, 'Invalid page ID');
  const result = await db.query(
    `SELECT ${PAGE_COLUMNS}
     FROM pages p JOIN users u ON u.id = p.owner_id
     WHERE p.id = $1 AND ${pageVisibleSql('$2')}`,
    [pageId, viewerId ?? null]
  );
  if (!result.rows[0]) throw new PageError(404, 'Page not found');
  return withFlags(result.rows[0]);
}

const withFlags = (p) => ({ ...p, is_owner: Boolean(p.is_owner), is_admin: Boolean(p.is_admin) });

async function loadOwnedPage(pageId, viewerId) {
  const page = await loadPage(pageId, viewerId);
  if (!page.is_owner) throw new PageError(403, 'Only the page owner can do that');
  return page;
}

// Day 53: the owner or an admin.
async function loadManagedPage(pageId, viewerId) {
  const page = await loadPage(pageId, viewerId);
  if (!page.is_admin) throw new PageError(403, "Only the page's owner and admins can do that");
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
    sendError(res, err, 'Creating the page failed. Please try again later.');
  }
}

// One section of GET /pages (Day 53: each its own query -- they used to be
// split from one site-wide top 100, so your own could go missing):
// - owned: pages you run, as owner or admin, newest first;
// - following: pages you follow and don't run, latest followed first;
// - discover: the rest, most followed first.
const PAGE_SECTIONS = {
  owned: {
    where: `(p.owner_id = $2 OR EXISTS (SELECT 1 FROM page_admins pa WHERE pa.page_id = p.id AND pa.user_id = $2))`,
    order: 'p.created_at DESC, p.id DESC'
  },
  following: {
    where: `p.owner_id <> $2 AND NOT EXISTS (SELECT 1 FROM page_admins pa WHERE pa.page_id = p.id AND pa.user_id = $2)
      AND EXISTS (SELECT 1 FROM page_follows f WHERE f.page_id = p.id AND f.user_id = $2)`,
    order: '(SELECT f.created_at FROM page_follows f WHERE f.page_id = p.id AND f.user_id = $2) DESC, p.id DESC'
  },
  discover: {
    where: `p.owner_id <> $2 AND NOT EXISTS (SELECT 1 FROM page_admins pa WHERE pa.page_id = p.id AND pa.user_id = $2)
      AND NOT EXISTS (SELECT 1 FROM page_follows f WHERE f.page_id = p.id AND f.user_id = $2)`,
    order: 'follower_count DESC, p.id DESC'
  }
};

async function listPageSection(section, userId, q, { limit, offset }) {
  const { where, order } = PAGE_SECTIONS[section];
  const result = await db.query(
    `SELECT ${PAGE_COLUMNS}
     FROM pages p JOIN users u ON u.id = p.owner_id
     WHERE ${pageVisibleSql('$2')}
       AND ($1 = '' OR p.name ILIKE '%' || $1 || '%')
       AND ${where}
     ORDER BY ${order}
     LIMIT $3 OFFSET $4`,
    [escapeLike(q), userId, limit + 1, offset]
  );
  const hasMore = result.rows.length > limit;
  return { pages: (hasMore ? result.rows.slice(0, limit) : result.rows).map(withFlags), hasMore };
}

// GET /pages?q= -> { owned, ownedHasMore, following, followingHasMore,
// discover, discoverHasMore } (the first page of each).
// ?section=owned|following|discover&page= -> { pages, page, hasMore }.
async function listPages(req, res) {
  try {
    // Day 43: names are stored as Unicode, so a Zawgyi query is converted.
    const q = typeof req.query.q === 'string' ? toUnicode(req.query.q.trim()) : '';
    const paging = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const { section } = req.query;
    if (section !== undefined) {
      if (!Object.hasOwn(PAGE_SECTIONS, section)) {
        throw new PageError(400, 'section must be owned, following or discover');
      }
      const { pages, hasMore } = await listPageSection(section, req.userId, q, paging);
      return res.json({ pages, page: paging.page, hasMore });
    }
    const first = { limit: paging.limit, offset: 0 };
    const [owned, following, discover] = await Promise.all(
      ['owned', 'following', 'discover'].map((s) => listPageSection(s, req.userId, q, first))
    );
    res.json({
      owned: owned.pages, ownedHasMore: owned.hasMore,
      following: following.pages, followingHasMore: following.hasMore,
      discover: discover.pages, discoverHasMore: discover.hasMore
    });
  } catch (err) {
    sendError(res, err, 'Loading pages failed. Please try again later.');
  }
}

// GET /pages/:id
async function getPage(req, res) {
  try {
    res.json(await loadPage(Number(req.params.id), req.userId));
  } catch (err) {
    sendError(res, err, 'Loading the page failed. Please try again later.');
  }
}

// PATCH /pages/:id { name?, category?, description? } -- owner or admins (Day 53).
async function updatePage(req, res) {
  try {
    const page = await loadManagedPage(Number(req.params.id), req.userId);
    const fields = cleanFields(req.body || {}, { partial: true });
    const keys = Object.keys(fields);
    if (keys.length === 0) throw new PageError(400, 'Nothing to update');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await db.query(`UPDATE pages SET ${sets} WHERE id = $1`, [page.id, ...keys.map((k) => fields[k])]);
    res.json(await loadPage(page.id, req.userId));
  } catch (err) {
    sendError(res, err, 'Updating the page failed. Please try again later.');
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
    sendError(res, err, 'Deleting the page failed. Please try again later.');
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
    sendError(res, err, 'Following the page failed. Please try again later.');
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
    sendError(res, err, 'Unfollowing the page failed. Please try again later.');
  }
}

// Day 53: page admins.

// GET /pages/:id/admins -- the owner and admins see who runs the page:
// { owner, admins } (at most MAX_ADMINS, so one list).
async function listAdmins(req, res) {
  try {
    const page = await loadManagedPage(Number(req.params.id), req.userId);
    const result = await db.query(
      `SELECT u.id, u.username, u.avatar_url, pa.created_at AS added_at
       FROM page_admins pa JOIN users u ON u.id = pa.user_id
       WHERE pa.page_id = $1
       ORDER BY pa.created_at ASC, u.id ASC`,
      [page.id]
    );
    const owner = (await db.query('SELECT id, username, avatar_url FROM users WHERE id = $1', [page.owner_id])).rows[0];
    res.json({ owner, admins: result.rows });
  } catch (err) {
    sendError(res, err, 'Loading the page admins failed. Please try again later.');
  }
}

// POST /pages/:id/admins { username } -- the owner adds an admin. Not
// themselves, not a deactivated account, not across a block; adding twice
// is harmless; at most MAX_ADMINS.
async function addAdmin(req, res) {
  try {
    const page = await loadOwnedPage(Number(req.params.id), req.userId);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().replace(/^@/, '') : '';
    if (!username) throw new PageError(400, 'Enter a username');
    const found = await db.query(
      `SELECT u.id, u.username, u.avatar_url FROM users u
       WHERE lower(u.username) = lower($1) AND NOT u.is_deactivated
         AND ${noBlockBetweenSql('$2', 'u.id')}`,
      [username, req.userId]
    );
    const person = found.rows[0];
    if (!person) throw new PageError(404, 'No one with that username');
    if (person.id === page.owner_id) throw new PageError(400, 'The owner already runs this page');
    const added = await db.query(
      `INSERT INTO page_admins (page_id, user_id, added_by)
       SELECT $1, $2, $3 WHERE (SELECT COUNT(*) FROM page_admins WHERE page_id = $1) < $4
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [page.id, person.id, req.userId, MAX_ADMINS]
    );
    if (added.rows.length === 0) {
      const already = await db.query('SELECT 1 FROM page_admins WHERE page_id = $1 AND user_id = $2', [page.id, person.id]);
      if (already.rows.length === 0) throw new PageError(400, `A page can have at most ${MAX_ADMINS} admins`);
    } else {
      // Step 3: they're told (once -- not when added again).
      await notificationService.notify({ userId: person.id, actorId: req.userId, type: 'page_admin', pageId: page.id });
    }
    res.status(201).json(person);
  } catch (err) {
    sendError(res, err, 'Adding the admin failed. Please try again later.');
  }
}

// DELETE /pages/:id/admins/:userId -- the owner removes an admin, or an
// admin leaves (themselves). Removing someone who isn't one is harmless.
async function removeAdmin(req, res) {
  try {
    const page = await loadManagedPage(Number(req.params.id), req.userId);
    const targetId = Number(req.params.userId);
    if (!Number.isInteger(targetId)) throw new PageError(400, 'Invalid user ID');
    if (targetId !== req.userId && !page.is_owner) throw new PageError(403, 'Only the page owner can do that');
    await db.query('DELETE FROM page_admins WHERE page_id = $1 AND user_id = $2', [page.id, targetId]);
    // "X made you an admin" no longer holds.
    await db.query("DELETE FROM notifications WHERE page_id = $1 AND user_id = $2 AND type = 'page_admin'", [page.id, targetId]);
    res.json({ removed: true });
  } catch (err) {
    sendError(res, err, 'Removing the admin failed. Please try again later.');
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
         ${pollColumnSql('$1')},
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
    sendError(res, err, 'Loading page posts failed. Please try again later.');
  }
}

module.exports = { CATEGORIES, createPage, listPages, getPage, updatePage, deletePage, followPage, unfollowPage, listPagePosts,
  listAdmins, addAdmin, removeAdmin };
