const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const blockService = require('../services/blockService');

async function followUser(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const followingId = parseInt(req.params.id);

    if (followingId === req.userId) {
      return res.status(400).send('You cannot follow yourself');
    }

    const userCheck = await db.query('SELECT id, is_private FROM users WHERE id = $1', [followingId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    if (await blockService.isBlocked(req.userId, followingId)) {
      return res.status(403).send('You cannot follow this user');
    }

    const existingFollow = await db.query(
      'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
      [req.userId, followingId]
    );
    if (existingFollow.rows.length > 0) {
      return res.status(400).send(
        existingFollow.rows[0].status === 'pending' ? 'You already have a pending follow request' : 'You are already following this user'
      );
    }

    // A private account's new follow lands as 'pending' and needs explicit
    // approval (see approveFollowRequest/denyFollowRequest below) instead
    // of auto-accepting -- a public account keeps the original
    // instant-follow behavior.
    const isPrivate = userCheck.rows[0].is_private;
    const status = isPrivate ? 'pending' : 'accepted';

    await db.query(
      'INSERT INTO follows (follower_id, following_id, status) VALUES ($1, $2, $3)',
      [req.userId, followingId, status]
    );
    await db.query(
      'INSERT INTO notifications (user_id, actor_id, type) VALUES ($1, $2, $3)',
      [followingId, req.userId, isPrivate ? 'follow_request' : 'follow']
    );
    res.status(201).json({ status });
  } catch (err) {
    // Same reasoning as likeController.likePost: follows has a
    // UNIQUE(follower_id, following_id) constraint that can catch a
    // concurrent request the existingFollow check above raced past --
    // that's the same conflict the check handles, not a real failure.
    if (err.code === '23505') {
      return res.status(400).send('You are already following this user');
    }
    sendServerError(res, err, 'Follow failed. Please try again later.');
  }
}

async function unfollowUser(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const followingId = parseInt(req.params.id);
    // Also lets a follower cancel a still-pending request they sent to a
    // private account -- "unfollow" and "cancel my request" are the same
    // action from the requester's side, just at different follow.status.
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
      WHERE follows.following_id = $1 AND follows.status = 'accepted'
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
      WHERE follows.follower_id = $1 AND follows.status = 'accepted'
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
      "SELECT COUNT(*) FROM follows WHERE following_id = $1 AND status = 'accepted'",
      [req.params.id]
    );
    const followingResult = await db.query(
      "SELECT COUNT(*) FROM follows WHERE follower_id = $1 AND status = 'accepted'",
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

async function getFollowRequests(req, res) {
  try {
    const result = await db.query(`
      SELECT users.id, users.username, users.avatar_url, follows.created_at
      FROM follows
      JOIN users ON follows.follower_id = users.id
      WHERE follows.following_id = $1 AND follows.status = 'pending'
      ORDER BY follows.created_at DESC
    `, [req.userId]);
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err, 'Fetch follow requests failed. Please try again later.');
  }
}

async function approveFollowRequest(req, res) {
  try {
    if (isNaN(req.params.followerId)) {
      return res.status(400).send('Invalid user ID');
    }
    const result = await db.query(
      "UPDATE follows SET status = 'accepted' WHERE follower_id = $1 AND following_id = $2 AND status = 'pending' RETURNING *",
      [req.params.followerId, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('No pending follow request from this user');
    }
    // Lets the requester know they're now actually following -- they had
    // no notification at all while pending (only the target was notified,
    // via 'follow_request').
    await db.query(
      'INSERT INTO notifications (user_id, actor_id, type) VALUES ($1, $2, $3)',
      [req.params.followerId, req.userId, 'follow_accepted']
    );
    res.status(200).send('Follow request approved');
  } catch (err) {
    sendServerError(res, err, 'Approve follow request failed. Please try again later.');
  }
}

async function denyFollowRequest(req, res) {
  try {
    if (isNaN(req.params.followerId)) {
      return res.status(400).send('Invalid user ID');
    }
    const result = await db.query(
      "DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'pending' RETURNING *",
      [req.params.followerId, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('No pending follow request from this user');
    }
    res.status(200).send('Follow request denied');
  } catch (err) {
    sendServerError(res, err, 'Deny follow request failed. Please try again later.');
  }
}

module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowCounts,
  getFollowRequests,
  approveFollowRequest,
  denyFollowRequest
};
