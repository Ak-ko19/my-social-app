const db = require('../db');
const { notMutedSql } = require('../services/muteService');
const { sendError } = require('../utils/httpError');
const { mediaOfStory, deleteMedia } = require('../services/mediaCleanupService');

// B3 Stories. Visibility follows the Instagram model: you see your own
// stories plus those of accounts you follow (accepted follows only),
// never across a block in either direction, never a deactivated
// account's. Expiry is enforced here at query time (expires_at > now()),
// see migration 018.

// SQL condition: "author of story alias `s` (user alias `u`) is visible to
// viewer $1". Shared by the tray and the single-story check below so the
// two can't drift apart.
const VISIBLE_TO_VIEWER_SQL = `
  s.expires_at > now()
  AND (
    u.id = $1
    OR (
      NOT u.is_deactivated
      AND EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = $1 AND f.following_id = u.id AND f.status = 'accepted'
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
           OR (b.blocker_id = u.id AND b.blocked_id = $1)
      )
      -- Day 47: a close-friends story is for the people on the list.
      AND (NOT s.close_friends OR EXISTS (
        SELECT 1 FROM close_friends cf WHERE cf.user_id = u.id AND cf.friend_id = $1
      ))
    )
  )`;

// POST /stories (multipart `image`) -- expires 24h from now (DB default).
async function createStory(req, res) {
  try {
    if (!req.cloudinaryResult) {
      return res.status(400).send('A story needs an image');
    }
    // Day 47: closeFriends=true (a form field) -- for your close friends only.
    const closeFriends = req.body?.closeFriends === 'true' || req.body?.closeFriends === true;
    const result = await db.query(
      'INSERT INTO stories (user_id, media_url, close_friends) VALUES ($1, $2, $3) RETURNING id, user_id, media_url, created_at, expires_at, close_friends',
      [req.userId, req.cloudinaryResult.secure_url, closeFriends]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Posting your story failed. Please try again later.');
  }
}

// GET /stories -- the tray: active stories the viewer may see, grouped by
// author. Order: your own group first, then authors with something you
// haven't seen, then by most recent story. Stories inside a group are
// oldest -> newest (the order they're watched in).
async function getStoriesTray(req, res) {
  try {
    const result = await db.query(
      `SELECT s.id, s.user_id, s.media_url, s.created_at, s.expires_at, s.close_friends,
              u.username, u.avatar_url,
              EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = $1) AS seen
       FROM stories s
       JOIN users u ON u.id = s.user_id
       WHERE ${VISIBLE_TO_VIEWER_SQL}
         -- Day 47: not people you muted (opening one directly still works).
         AND ${notMutedSql('$1', 'u.id')}
       ORDER BY s.user_id, s.created_at ASC`,
      [req.userId]
    );

    const groups = new Map();
    for (const row of result.rows) {
      if (!groups.has(row.user_id)) {
        groups.set(row.user_id, {
          user_id: row.user_id,
          username: row.username,
          avatar_url: row.avatar_url,
          is_own: row.user_id === req.userId,
          stories: []
        });
      }
      groups.get(row.user_id).stories.push({
        id: row.id,
        media_url: row.media_url,
        created_at: row.created_at,
        expires_at: row.expires_at,
        close_friends: row.close_friends,
        seen: row.seen
      });
    }

    const tray = [...groups.values()].map((g) => ({
      ...g,
      all_seen: g.stories.every((st) => st.seen),
      latest_at: g.stories[g.stories.length - 1].created_at
    }));
    tray.sort((a, b) => {
      if (a.is_own !== b.is_own) return a.is_own ? -1 : 1;
      if (a.all_seen !== b.all_seen) return a.all_seen ? 1 : -1;
      return new Date(b.latest_at) - new Date(a.latest_at);
    });

    res.json(tray);
  } catch (err) {
    sendError(res, err, 'Loading stories failed. Please try again later.');
  }
}

// POST /stories/:id/view -- idempotent "seen" mark. 404 for a story the
// viewer can't see (or that expired), same "don't confirm it exists" rule
// as posts.
async function markStoryViewed(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid story ID');
    }
    const visible = await db.query(
      `SELECT s.id FROM stories s JOIN users u ON u.id = s.user_id
       WHERE s.id = $2 AND ${VISIBLE_TO_VIEWER_SQL}`,
      [req.userId, req.params.id]
    );
    if (visible.rows.length === 0) {
      return res.status(404).send('Story not found');
    }
    await db.query(
      'INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, req.userId]
    );
    res.status(204).end();
  } catch (err) {
    sendError(res, err, 'Marking story as viewed failed. Please try again later.');
  }
}

// DELETE /stories/:id -- author only.
async function deleteStory(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid story ID');
    }
    const existing = await db.query('SELECT user_id FROM stories WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).send('Story not found');
    }
    if (existing.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only delete your own story');
    }
    const media = await mediaOfStory(req.params.id);
    await db.query('DELETE FROM stories WHERE id = $1', [req.params.id]);
    deleteMedia(media);
    res.status(200).send('Story deleted');
  } catch (err) {
    sendError(res, err, 'Deleting story failed. Please try again later.');
  }
}

module.exports = { createStory, getStoriesTray, markStoryViewed, deleteStory };
