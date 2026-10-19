// Day 47: your close friends list (migration 057), like Instagram's. Only
// you see it; people on it aren't told. A "Close friends" post or story is
// seen by them and you. You can add people who follow you.
const db = require('../db');
const { sendError } = require('../utils/httpError');
const { getPagination } = require('../utils/pagination');

const targetId = (req) => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : null);

// GET /close-friends -- your list, newest added first.
async function listCloseFriends(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 50, maxLimit: 100 });
    const result = await db.query(
      `SELECT users.id, users.username, users.avatar_url, cf.created_at AS added_at
       FROM close_friends cf JOIN users ON users.id = cf.friend_id
       WHERE cf.user_id = $1 AND NOT users.is_deactivated
       ORDER BY cf.created_at DESC, users.id DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    res.json({ page, closeFriends: hasMore ? result.rows.slice(0, limit) : result.rows, hasMore });
  } catch (err) {
    sendError(res, err, 'Loading close friends failed. Please try again later.');
  }
}

// GET /close-friends/candidates?q= -- people who follow you and aren't on
// the list yet (optionally whose name contains q), A-Z.
async function listCandidates(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const result = await db.query(
      `SELECT users.id, users.username, users.avatar_url
       FROM follows f JOIN users ON users.id = f.follower_id
       WHERE f.following_id = $1 AND f.status = 'accepted' AND NOT users.is_deactivated
         AND NOT EXISTS (SELECT 1 FROM close_friends cf WHERE cf.user_id = $1 AND cf.friend_id = users.id)
         AND ($4 = '' OR users.username ILIKE '%' || $4 || '%')
       ORDER BY lower(users.username), users.id
       LIMIT $2 OFFSET $3`,
      [req.userId, limit + 1, offset, q.replace(/[\%_]/g, (c) => `\${c}`)]
    );
    const hasMore = result.rows.length > limit;
    res.json({ page, candidates: hasMore ? result.rows.slice(0, limit) : result.rows, hasMore });
  } catch (err) {
    sendError(res, err, 'Loading followers failed. Please try again later.');
  }
}

// PUT /close-friends/:id -- add (idempotent). Only someone who follows you.
async function addCloseFriend(req, res) {
  try {
    const friendId = targetId(req);
    if (friendId === null) return res.status(400).send('Invalid user ID');
    if (friendId === req.userId) return res.status(400).send("You can't add yourself");
    const follows = await db.query(
      "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted'",
      [friendId, req.userId]
    );
    if (follows.rows.length === 0) return res.status(400).send('You can add people who follow you');
    await db.query('INSERT INTO close_friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, friendId]);
    res.json({ closeFriend: true });
  } catch (err) {
    sendError(res, err, 'Adding to close friends failed. Please try again later.');
  }
}

// DELETE /close-friends/:id -- remove (idempotent). They no longer see your
// close-friends posts and stories.
async function removeCloseFriend(req, res) {
  try {
    const friendId = targetId(req);
    if (friendId === null) return res.status(400).send('Invalid user ID');
    await db.query('DELETE FROM close_friends WHERE user_id = $1 AND friend_id = $2', [req.userId, friendId]);
    res.json({ closeFriend: false });
  } catch (err) {
    sendError(res, err, 'Removing from close friends failed. Please try again later.');
  }
}

module.exports = { listCloseFriends, listCandidates, addCloseFriend, removeCloseFriend };
