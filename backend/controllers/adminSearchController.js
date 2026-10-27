// Days 103-104: a content search for admins (Admin > Search) -- posts and
// comments by their text, accounts by username or exact email. Unlike the
// app's own search it sees everything: any audience, private groups,
// banned and deactivated accounts -- an admin looking into abuse needs to.
// So every search (its first page) goes in the admin log, query and all.
const db = require('../db');
const { sendError } = require('../utils/httpError');
const { escapeLike } = require('../utils/escapeLike');
const { toUnicode } = require('../utils/myanmarText');
const { textOf } = require('../utils/bodyText');
const adminLog = require('../services/adminLogService');

const TYPES = ['posts', 'comments', 'users'];
const MIN_QUERY = 2;
const MAX_QUERY = 100;
const PAGE_SIZE = 20;
const MAX_PAGE = 50;
const EXCERPT = 300;

// $1 the pattern (escaped), $2 limit, $3 offset; accounts also $4, the
// query as typed (an exact email). Through the trigram indexes (002, 084).
const QUERIES = {
  posts: `SELECT p.id, left(p.content, ${EXCERPT}) AS content, p.created_at, p.visibility,
            p.community_id, co.name AS community_name, co.privacy AS community_privacy, p.page_id, pg.name AS page_name,
            u.id AS author_id, u.username AS author_username, (u.banned_at IS NOT NULL) AS author_banned
          FROM posts p
          JOIN users u ON u.id = p.user_id
          LEFT JOIN communities co ON co.id = p.community_id
          LEFT JOIN pages pg ON pg.id = p.page_id
          WHERE p.content ILIKE '%' || $1 || '%'
          ORDER BY p.created_at DESC, p.id DESC LIMIT $2 OFFSET $3`,
  comments: `SELECT c.id, left(c.content, ${EXCERPT}) AS content, c.created_at, c.post_id,
               u.id AS author_id, u.username AS author_username, (u.banned_at IS NOT NULL) AS author_banned
             FROM comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.content ILIKE '%' || $1 || '%'
             ORDER BY c.created_at DESC, c.id DESC LIMIT $2 OFFSET $3`,
  users: `SELECT u.id, u.username, u.email, u.created_at, u.is_private, u.is_deactivated, u.is_admin,
            (u.banned_at IS NOT NULL) AS banned, u.banned_until
          FROM users u
          WHERE u.username ILIKE '%' || $1 || '%' OR lower(u.email) = lower($4)
          ORDER BY (lower(u.username) = lower($4) OR lower(u.email) = lower($4)) DESC, u.created_at DESC, u.id DESC
          LIMIT $2 OFFSET $3`
};

// GET /admin/search?q=&type=posts|comments|users&page=N
// -> { type, results, hasMore, page }
async function search(req, res) {
  try {
    const type = req.query.type === undefined ? 'posts' : String(req.query.type);
    if (!TYPES.includes(type)) return res.status(400).send(`type must be one of: ${TYPES.join(', ')}`);
    const q = toUnicode(textOf(req.query.q).trim());
    if (q.length < MIN_QUERY || q.length > MAX_QUERY) {
      return res.status(400).send(`Search for ${MIN_QUERY} to ${MAX_QUERY} characters.`);
    }
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) return res.status(400).send(`page must be 1 to ${MAX_PAGE}`);

    const params = [escapeLike(q), PAGE_SIZE + 1, (page - 1) * PAGE_SIZE];
    const result = await db.query(QUERIES[type], type === 'users' ? [...params, q] : params);
    const hasMore = result.rows.length > PAGE_SIZE;
    const results = hasMore ? result.rows.slice(0, PAGE_SIZE) : result.rows;
    // Who looked for what (once per search, not per page).
    if (page === 1) {
      await adminLog.record(db, {
        adminId: req.userId,
        action: 'admin_search',
        targetType: 'search',
        targetId: type,
        targetLabel: q,
        details: { type, results: results.length, hasMore }
      });
    }
    res.json({ type, results, hasMore, page });
  } catch (err) {
    sendError(res, err, 'Searching failed. Please try again later.');
  }
}

module.exports = { search };
