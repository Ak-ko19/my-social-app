const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const notificationService = require('../services/notificationService');
const { getPagination } = require('../utils/pagination');

async function getNotifications(req, res) {
  try {
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });

    const result = await db.query(`
      SELECT
        notifications.id, notifications.type, notifications.post_id, notifications.comment_id,
        notifications.is_read, notifications.created_at,
        actor.id AS actor_id, actor.username AS actor_username, actor.avatar_url AS actor_avatar_url,
        posts.content AS post_content
      FROM notifications
      JOIN users actor ON notifications.actor_id = actor.id
      LEFT JOIN posts ON notifications.post_id = posts.id
      WHERE notifications.user_id = $1
      ORDER BY notifications.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.userId, limit, offset]);

    res.status(200).json({ page, limit, notifications: result.rows });
  } catch (err) {
    sendServerError(res, err, 'Fetch notifications failed. Please try again later.');
  }
}

async function getUnreadCount(req, res) {
  try {
    const result = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.userId]
    );
    res.status(200).json({ unreadCount: parseInt(result.rows[0].count) });
  } catch (err) {
    sendServerError(res, err, 'Fetch unread count failed. Please try again later.');
  }
}

async function markAsRead(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid notification ID');
    }
    const result = await db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('Notification not found');
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err, 'Mark as read failed. Please try again later.');
  }
}

async function markAllAsRead(req, res) {
  try {
    await db.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.userId]
    );
    res.status(200).send('All notifications marked as read');
  } catch (err) {
    sendServerError(res, err, 'Mark all as read failed. Please try again later.');
  }
}

// B11: GET /notification-preferences -- the five category switches.
async function getPreferences(req, res) {
  try {
    res.json(await notificationService.getPreferences(req.userId));
  } catch (err) {
    sendServerError(res, err, 'Loading notification settings failed. Please try again later.');
  }
}

// B11: PUT /notification-preferences -- partial; only boolean values for
// known categories are applied, anything else is a 400.
async function updatePreferences(req, res) {
  try {
    const body = req.body || {};
    const keys = Object.keys(body);
    const unknown = keys.filter((k) => !notificationService.CATEGORIES.includes(k));
    if (keys.length === 0 || unknown.length > 0 || keys.some((k) => typeof body[k] !== 'boolean')) {
      return res.status(400).send(`Send true/false for any of: ${notificationService.CATEGORIES.join(', ')}`);
    }
    res.json(await notificationService.updatePreferences(req.userId, body));
  } catch (err) {
    sendServerError(res, err, 'Saving notification settings failed. Please try again later.');
  }
}

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead,
  getPreferences,
  updatePreferences
};
