const db = require('../db');
const { sendServerError } = require('../utils/sendError');

async function followUser(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const followingId = parseInt(req.params.id);

    if (followingId === req.userId) {
      return res.status(400).send('You cannot follow yourself');
    }

    const userCheck = await db.query('SELECT * FROM users WHERE id = $1', [followingId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const existingFollow = await db.query(
      'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
      [req.userId, followingId]
    );
    if (existingFollow.rows.length > 0) {
      return res.status(400).send('You are already following this user');
    }

    await db.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
      [req.userId, followingId]
    );
    await db.query(
      'INSERT INTO notifications (user_id, actor_id, type) VALUES ($1, $2, $3)',
      [followingId, req.userId, 'follow']
    );
    res.status(201).send('User followed successfully');
  } catch (err) {
    sendServerError(res, err, 'Follow failed. Please try again later.');
  }
}

async function unfollowUser(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const followingId = parseInt(req.params.id);
    const result = await db.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING *',
      [req.userId, followingId]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('You are not following this user');
    }
    res.send('User unfollowed successfully');
  } catch (err) {
    sendServerError(res, err, 'Unfollow failed. Please try again later.');
  }
}

async function getFollowers(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const result = await db.query(`
      SELECT users.id, users.username, users.avatar_url
      FROM follows
      JOIN users ON follows.follower_id = users.id
      WHERE follows.following_id = $1
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err, 'Fetch followers failed. Please try again later.');
  }
}

async function getFollowing(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const result = await db.query(`
      SELECT users.id, users.username, users.avatar_url
      FROM follows
      JOIN users ON follows.following_id = users.id
      WHERE follows.follower_id = $1
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err, 'Fetch following failed. Please try again later.');
  }
}

async function getFollowCounts(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const followersResult = await db.query(
      'SELECT COUNT(*) FROM follows WHERE following_id = $1',
      [req.params.id]
    );
    const followingResult = await db.query(
      'SELECT COUNT(*) FROM follows WHERE follower_id = $1',
      [req.params.id]
    );
    res.json({
      userId: req.params.id,
      followersCount: parseInt(followersResult.rows[0].count),
      followingCount: parseInt(followingResult.rows[0].count)
    });
  } catch (err) {
    sendServerError(res, err, 'Fetch follow counts failed. Please try again later.');
  }
}

module.exports = { followUser, unfollowUser, getFollowers, getFollowing, getFollowCounts };
