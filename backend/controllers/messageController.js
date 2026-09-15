const db = require('../db');

async function sendMessage(req, res) {
  try {
    const receiverId = parseInt(req.body.receiverId);
    const content = (req.body.content || '').trim();

    if (isNaN(receiverId)) {
      return res.status(400).send('A valid receiverId is required');
    }
    if (!content) {
      return res.status(400).send('Message content cannot be empty');
    }
    if (receiverId === req.userId) {
      return res.status(400).send('You cannot message yourself');
    }

    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [receiverId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const result = await db.query(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, receiverId, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Send message failed: ' + err.message);
  }
}

async function getConversations(req, res) {
  try {
    const lastMessages = await db.query(`
      SELECT DISTINCT ON (other_id)
        other_id, users.username, users.avatar_url, m.content AS last_message, m.created_at AS last_message_at
      FROM (
        SELECT
          CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_id,
          content,
          created_at
        FROM messages
        WHERE sender_id = $1 OR receiver_id = $1
      ) m
      JOIN users ON users.id = m.other_id
      ORDER BY other_id, m.created_at DESC
    `, [req.userId]);

    const unreadCounts = await db.query(
      'SELECT sender_id, COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = false GROUP BY sender_id',
      [req.userId]
    );
    const unreadMap = {};
    unreadCounts.rows.forEach((row) => {
      unreadMap[row.sender_id] = parseInt(row.count);
    });

    const conversations = lastMessages.rows
      .map((row) => ({
        userId: row.other_id,
        username: row.username,
        avatarUrl: row.avatar_url,
        lastMessage: row.last_message,
        lastMessageAt: row.last_message_at,
        unreadCount: unreadMap[row.other_id] || 0
      }))
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.status(200).json(conversations);
  } catch (err) {
    res.status(500).send('Fetch conversations failed: ' + err.message);
  }
}

async function getConversation(req, res) {
  try {
    const otherUserId = parseInt(req.params.userId);
    if (isNaN(otherUserId)) {
      return res.status(400).send('Invalid user ID');
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT * FROM messages
      WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at ASC
      LIMIT $3 OFFSET $4
    `, [req.userId, otherUserId, limit, offset]);

    res.status(200).json({ page, limit, messages: result.rows });
  } catch (err) {
    res.status(500).send('Fetch conversation failed: ' + err.message);
  }
}

async function markConversationRead(req, res) {
  try {
    const otherUserId = parseInt(req.params.userId);
    if (isNaN(otherUserId)) {
      return res.status(400).send('Invalid user ID');
    }

    await db.query(
      'UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false',
      [otherUserId, req.userId]
    );
    res.status(200).send('Conversation marked as read');
  } catch (err) {
    res.status(500).send('Mark conversation as read failed: ' + err.message);
  }
}

module.exports = { sendMessage, getConversations, getConversation, markConversationRead };
