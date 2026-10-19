// Day 47: mute / unmute a person, and your muted list (Settings). Private:
// the muted person is never told. See services/muteService.
const db = require('../db');
const { sendError } = require('../utils/httpError');
const { getPagination } = require('../utils/pagination');

const targetId = (req) => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : null);

async function muteUser(req, res) {
  try {
    const mutedId = targetId(req);
    if (mutedId === null) return res.status(400).send('Invalid user ID');
    if (mutedId === req.userId) return res.status(400).send("You can't mute yourself");
    const user = await db.query('SELECT id FROM users WHERE id = $1', [mutedId]);
    if (user.rows.length === 0) return res.status(404).send('User not found');
    // Muting twice is harmless (the double click, two tabs).
    await db.query('INSERT INTO user_mutes (muter_id, muted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, mutedId]);
    res.status(201).json({ muted: true });
  } catch (err) {
    sendError(res, err, 'Muting failed. Please try again later.');
  }
}

async function unmuteUser(req, res) {
  try {
    const mutedId = targetId(req);
    if (mutedId === null) return res.status(400).send('Invalid user ID');
    await db.query('DELETE FROM user_mutes WHERE muter_id = $1 AND muted_id = $2', [req.userId, mutedId]);
    res.json({ muted: false });
  } catch (err) {
    sendError(res, err, 'Unmuting failed. Please try again later.');
  }
}

// GET /muted-users -- newest first, paged like /blocked-users.
async function getMutedUsers(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const result = await db.query(
      `SELECT users.id, users.username, users.avatar_url, user_mutes.created_at AS muted_at
       FROM user_mutes JOIN users ON users.id = user_mutes.muted_id
       WHERE user_mutes.muter_id = $1
       ORDER BY user_mutes.created_at DESC, users.id DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    res.json({ page, mutedUsers: hasMore ? result.rows.slice(0, limit) : result.rows, hasMore });
  } catch (err) {
    sendError(res, err, 'Loading muted accounts failed. Please try again later.');
  }
}

module.exports = { muteUser, unmuteUser, getMutedUsers };
