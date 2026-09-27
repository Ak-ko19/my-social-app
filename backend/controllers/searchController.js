const db = require('../db');
const { pageColumnSql } = require('../services/reactionService');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');

async function searchUsers(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).send('Search query is required');
    }
    const viewerId = req.userId ?? null;
    const result = await db.query(
      `SELECT id, username, bio, avatar_url FROM users
       WHERE username ILIKE $1
         AND NOT is_deactivated
         AND ($2::int IS NULL OR NOT EXISTS (
           SELECT 1 FROM blocks
           WHERE (blocks.blocker_id = $2 AND blocks.blocked_id = users.id)
              OR (blocks.blocker_id = users.id AND blocks.blocked_id = $2)
         ))
       ORDER BY username ASC LIMIT 20`,
      [`%${q}%`, viewerId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    sendServerError(res, err, 'Search users failed. Please try again later.');
  }
}

async function searchPosts(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).send('Search query is required');
    }
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });
    const viewerId = req.userId ?? null;

    const result = await db.query(`
      SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, users.id AS user_id, users.username, users.avatar_url,
        ${pageColumnSql()}
      FROM posts
      JOIN users ON posts.user_id = users.id
      -- B13: community posts live in their community feed only.
      WHERE posts.community_id IS NULL AND posts.content ILIKE $1
        AND ($4::int IS NULL OR NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocks.blocker_id = $4 AND blocks.blocked_id = posts.user_id)
             OR (blocks.blocker_id = posts.user_id AND blocks.blocked_id = $4)
        ))
        AND (
          ((NOT users.is_private OR posts.page_id IS NOT NULL) AND posts.visibility = 'public')
          OR users.id = $4
          OR EXISTS (SELECT 1 FROM follows WHERE follows.follower_id = $4 AND follows.following_id = users.id AND follows.status = 'accepted')
        )
        AND NOT users.is_deactivated
      ORDER BY posts.created_at DESC
      LIMIT $2 OFFSET $3
    `, [`%${q}%`, limit, offset, viewerId]);

    res.status(200).json({ page, limit, posts: result.rows });
  } catch (err) {
    sendServerError(res, err, 'Search posts failed. Please try again later.');
  }
}

module.exports = { searchUsers, searchPosts };
