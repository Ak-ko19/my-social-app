const db = require('../db');
const { getPagination } = require('../utils/pagination');
const { escapeLike } = require('../utils/escapeLike');
const { sendError } = require('../utils/httpError');
const blockService = require('../services/blockService');
const { noBlockBetweenSql } = require('../services/blockService');
const notificationService = require('../services/notificationService');

// Who may see a user's follower/following LISTS (counts stay public, like
// Instagram): the user themselves, or anyone when the account is public.
// A private account's lists are limited to accepted followers. Deactivated
// accounts and blocks (either direction) 404, same as the profile itself.
// Returns null when allowed, else { status, message }.
async function connectionsAccessError(targetId, viewerId) {
  const result = await db.query(
    `SELECT users.is_private, users.is_deactivated,
       $2::int IS NOT NULL AND EXISTS(
         SELECT 1 FROM follows
         WHERE follows.follower_id = $2 AND follows.following_id = users.id AND follows.status = 'accepted'
       ) AS viewer_is_follower
     FROM users WHERE users.id = $1`,
    [targetId, viewerId ?? null]
  );
  if (result.rows.length === 0) return { status: 404, message: 'User not found' };
  if (viewerId != null && Number(targetId) === viewerId) return null;
  const target = result.rows[0];
  if (target.is_deactivated) return { status: 404, message: 'User not found' };
  if (viewerId != null && (await blockService.isBlocked(viewerId, Number(targetId)))) {
    return { status: 404, message: 'User not found' };
  }
  if (target.is_private && !target.viewer_is_follower) {
    return { status: 403, message: 'This account is private' };
  }
  return null;
}

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
    await notificationService.notify({ userId: Number(followingId), actorId: req.userId, type: isPrivate ? 'follow_request' : 'follow' });
    res.status(201).json({ status });
  } catch (err) {
    // Same reasoning as likeController.likePost: follows has a
    // UNIQUE(follower_id, following_id) constraint that can catch a
    // concurrent request the existingFollow check above raced past --
    // that's the same conflict the check handles, not a real failure.
    if (err.code === '23505') {
      return res.status(400).send('You are already following this user');
    }
    sendError(res, err, 'Follow failed. Please try again later.');
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
    sendError(res, err, 'Unfollow failed. Please try again later.');
  }
}

// Day 37: friends = people who follow each other (both follows accepted).
// FRIENDS_OF(param) is a FROM-clause subquery of a user's active friends,
// as rows (friend_id). Both follows are looked up by the unique
// (follower_id, following_id) index.
const FRIENDS_OF = (param) => `(
  SELECT f1.following_id AS friend_id
  FROM follows f1
  JOIN follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id AND f2.status = 'accepted'
  JOIN users fu ON fu.id = f1.following_id AND NOT fu.is_deactivated
  WHERE f1.follower_id = ${param} AND f1.status = 'accepted'
) friends`;

const CONNECTION_TYPES = ['friends', 'followers', 'following'];

// GET /users/:id/connections?type=friends|followers|following&q=&page=&limit=
// -- one page, A-Z, with the viewer's relation to each person (for the
// Follow / Follow back / Following button). Access: connectionsAccessError
// (above); deactivated accounts and anyone blocked with the viewer are left
// out. Day 69: q filters by username (the group-member picker searches the
// people you follow with it).
async function getConnections(req, res) {
  try {
    if (isNaN(req.params.id)) return res.status(400).send('Invalid user ID');
    const type = req.query.type || 'friends';
    if (!CONNECTION_TYPES.includes(type)) return res.status(400).send(`type must be one of: ${CONNECTION_TYPES.join(', ')}`);
    const denied = await connectionsAccessError(req.params.id, req.userId);
    if (denied) return res.status(denied.status).send(denied.message);
    const { page, limit, offset } = getPagination(req, { defaultLimit: 30, maxLimit: 100 });
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const people = {
      friends: `SELECT friend_id AS id FROM ${FRIENDS_OF('$1')}`,
      followers: "SELECT follower_id AS id FROM follows WHERE following_id = $1 AND status = 'accepted'",
      following: "SELECT following_id AS id FROM follows WHERE follower_id = $1 AND status = 'accepted'"
    }[type];
    const result = await db.query(
      `SELECT u.id, u.username, u.avatar_url,
         $2::int IS NOT NULL AND EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id AND status = 'accepted') AS is_following,
         $2::int IS NOT NULL AND EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id AND status = 'pending') AS request_pending,
         $2::int IS NOT NULL AND EXISTS(SELECT 1 FROM follows WHERE follower_id = u.id AND following_id = $2 AND status = 'accepted') AS follows_you
       FROM users u
       WHERE u.id IN (${people}) AND NOT u.is_deactivated
         AND ($2::int IS NULL OR ${noBlockBetweenSql('$2', 'u.id')})
         AND ($5 = '' OR u.username ILIKE '%' || $5 || '%')
       ORDER BY LOWER(u.username), u.id
       LIMIT $3 OFFSET $4`,
      [req.params.id, req.userId ?? null, limit + 1, offset, escapeLike(q)]
    );
    const hasMore = result.rows.length > limit;
    res.json({ users: hasMore ? result.rows.slice(0, limit) : result.rows, page, hasMore });
  } catch (err) {
    sendError(res, err, 'Loading connections failed. Please try again later.');
  }
}

// GET /users/:id/mutual-friends -- the viewer's friends who are also this
// person's friends: { count, sample: up to 3 [{ id, username, avatar_url }] }
// for "Friends with A, B and 2 others". Same access rule as the lists; empty
// for yourself or a logged-out visitor.
async function getMutualFriends(req, res) {
  try {
    if (isNaN(req.params.id)) return res.status(400).send('Invalid user ID');
    const targetId = Number(req.params.id);
    if (req.userId == null || req.userId === targetId) return res.json({ count: 0, sample: [] });
    const denied = await connectionsAccessError(targetId, req.userId);
    if (denied) return res.status(denied.status).send(denied.message);
    const result = await db.query(
      `WITH mine AS (SELECT friend_id FROM ${FRIENDS_OF('$1')}),
       theirs AS (SELECT friend_id FROM ${FRIENDS_OF('$2')}),
       mutual AS (
         SELECT friend_id FROM mine
         WHERE friend_id IN (SELECT friend_id FROM theirs) AND friend_id <> $2
       )
       SELECT (SELECT COUNT(*)::int FROM mutual) AS count,
         COALESCE((SELECT json_agg(s) FROM (
           SELECT u.id, u.username, u.avatar_url FROM users u
           WHERE u.id IN (SELECT friend_id FROM mutual)
           ORDER BY LOWER(u.username), u.id LIMIT 3
         ) s), '[]'::json) AS sample`,
      [req.userId, targetId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Loading mutual friends failed. Please try again later.');
  }
}

async function getFollowCounts(req, res) {
  try {
    // Day 85: a whole id ("1.5" passed isNaN, then failed in the query),
    // echoed back as a number like every other id.
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(400).send('Invalid user ID');
    }
    // Day 37: deactivated accounts aren't counted (they're hidden), and
    // friends = people who follow each other.
    const counts = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM follows f JOIN users u ON u.id = f.follower_id
            WHERE f.following_id = $1 AND f.status = 'accepted' AND NOT u.is_deactivated) AS followers,
         (SELECT COUNT(*)::int FROM follows f JOIN users u ON u.id = f.following_id
            WHERE f.follower_id = $1 AND f.status = 'accepted' AND NOT u.is_deactivated) AS following,
         (SELECT COUNT(*)::int FROM ${FRIENDS_OF('$1')}) AS friends`,
      [userId]
    );
    res.json({
      userId,
      followersCount: counts.rows[0].followers,
      followingCount: counts.rows[0].following,
      friendsCount: counts.rows[0].friends
    });
  } catch (err) {
    sendError(res, err, 'Fetch follow counts failed. Please try again later.');
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
    sendError(res, err, 'Fetch follow requests failed. Please try again later.');
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
    await notificationService.notify({ userId: Number(req.params.followerId), actorId: req.userId, type: 'follow_accepted' });
    res.status(200).send('Follow request approved');
  } catch (err) {
    sendError(res, err, 'Approve follow request failed. Please try again later.');
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
    sendError(res, err, 'Deny follow request failed. Please try again later.');
  }
}

module.exports = {
  followUser,
  unfollowUser,
  getFollowCounts,
  getFollowRequests,
  approveFollowRequest,
  denyFollowRequest,
  getConnections,
  getMutualFriends
};
