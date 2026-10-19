// Day 47: restrict / unrestrict a person, and your restricted list
// (Settings). Private: they are never told. See services/restrictService.
const db = require('../db');
const { sendError } = require('../utils/httpError');
const { getPagination } = require('../utils/pagination');

const targetId = (req) => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : null);

async function restrictUser(req, res) {
  try {
    const restrictedId = targetId(req);
    if (restrictedId === null) return res.status(400).send('Invalid user ID');
    if (restrictedId === req.userId) return res.status(400).send("You can't restrict yourself");
    const user = await db.query('SELECT id FROM users WHERE id = $1', [restrictedId]);
    if (user.rows.length === 0) return res.status(404).send('User not found');
    // Twice is harmless (the double click, two tabs).
    await db.query('INSERT INTO user_restrictions (restricter_id, restricted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, restrictedId]);
    res.status(201).json({ restricted: true });
  } catch (err) {
    sendError(res, err, 'Restricting failed. Please try again later.');
  }
}

// Their comments already waiting stay waiting (approve or delete them);
// new ones are ordinary again.
async function unrestrictUser(req, res) {
  try {
    const restrictedId = targetId(req);
    if (restrictedId === null) return res.status(400).send('Invalid user ID');
    await db.query('DELETE FROM user_restrictions WHERE restricter_id = $1 AND restricted_id = $2', [req.userId, restrictedId]);
    res.json({ restricted: false });
  } catch (err) {
    sendError(res, err, 'Unrestricting failed. Please try again later.');
  }
}

// GET /restricted-users -- newest first, paged like /blocked-users.
async function getRestrictedUsers(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const result = await db.query(
      `SELECT users.id, users.username, users.avatar_url, r.created_at AS restricted_at
       FROM user_restrictions r JOIN users ON users.id = r.restricted_id
       WHERE r.restricter_id = $1
       ORDER BY r.created_at DESC, users.id DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    res.json({ page, restrictedUsers: hasMore ? result.rows.slice(0, limit) : result.rows, hasMore });
  } catch (err) {
    sendError(res, err, 'Loading restricted accounts failed. Please try again later.');
  }
}

module.exports = { restrictUser, unrestrictUser, getRestrictedUsers };
