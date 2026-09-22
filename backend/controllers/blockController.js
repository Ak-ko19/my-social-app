const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');

async function blockUser(req, res) {
  try {
    const blockedId = parseInt(req.params.id, 10);
    if (isNaN(blockedId)) {
      return res.status(400).send('Invalid user ID');
    }
    if (blockedId === req.userId) {
      return res.status(400).send('You cannot block yourself');
    }

    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [blockedId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    await db.query(
      'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)',
      [req.userId, blockedId]
    );

    // Blocking severs any existing follow relationship in BOTH directions --
    // a block is a stronger relationship than a follow, so leaving a stale
    // follow row around would let the blocked user's posts keep appearing
    // in a feed query that only filters by `follows`, or vice versa.
    await db.query(
      `DELETE FROM follows
       WHERE (follower_id = $1 AND following_id = $2)
          OR (follower_id = $2 AND following_id = $1)`,
      [req.userId, blockedId]
    );

    res.status(201).send('User blocked successfully');
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).send('You have already blocked this user');
    }
    sendServerError(res, err, 'Block failed. Please try again later.');
  }
}

async function unblockUser(req, res) {
  try {
    const blockedId = parseInt(req.params.id, 10);
    if (isNaN(blockedId)) {
      return res.status(400).send('Invalid user ID');
    }
    const result = await db.query(
      'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING *',
      [req.userId, blockedId]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('You have not blocked this user');
    }
    res.send('User unblocked successfully');
  } catch (err) {
    sendServerError(res, err, 'Unblock failed. Please try again later.');
  }
}

async function getBlockedUsers(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const result = await db.query(
      `SELECT users.id, users.username, users.avatar_url, blocks.created_at AS blocked_at
       FROM blocks
       JOIN users ON users.id = blocks.blocked_id
       WHERE blocks.blocker_id = $1
       ORDER BY blocks.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    const blockedUsers = hasMore ? result.rows.slice(0, limit) : result.rows;
    res.json({ page, blockedUsers, hasMore });
  } catch (err) {
    sendServerError(res, err, 'Fetch blocked users failed. Please try again later.');
  }
}

module.exports = { blockUser, unblockUser, getBlockedUsers };
