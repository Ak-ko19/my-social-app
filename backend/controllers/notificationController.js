const db = require('../db');

async function getNotifications(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

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
    res.status(500).send('Fetch notifications failed: ' + err.message);
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
    res.status(500).send('Fetch unread count failed: ' + err.message);
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
    res.status(500).send('Mark as read failed: ' + err.message);
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
    res.status(500).send('Mark all as read failed: ' + err.message);
  }
}

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead };
