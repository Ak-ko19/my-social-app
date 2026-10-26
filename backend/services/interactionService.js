// Day 47: who can message me and who can comment on my posts (migration
// 058; Settings > Messages and comments).
const db = require('../db');
const { HttpError } = require('../utils/httpError');

const MESSAGE_PERMISSIONS = ['everyone', 'following', 'nobody'];
const COMMENT_PERMISSIONS = ['everyone', 'followers', 'following'];

class InteractionError extends HttpError {
  constructor(message) {
    super(403, message);
  }
}

const follows = (followerSql, followingSql) =>
  `EXISTS (SELECT 1 FROM follows WHERE follower_id = ${followerSql} AND following_id = ${followingSql} AND status = 'accepted')`;

// May `senderId` message `recipientId` in a direct chat? Their setting
// decides -- except that a chat the recipient has already written in
// always goes on (turning the setting on doesn't cut off a friend).
// As SQL: the sender is `senderSql`, the recipient the users row `r`
// (Day 100: the story tray asks it for every author in one query).
function canMessageSql(senderSql, r) {
  return `(${r}.message_permission = 'everyone'
    OR (${r}.message_permission = 'following' AND ${follows(`${r}.id`, senderSql)})
    OR EXISTS (
      SELECT 1 FROM conversations dc
      JOIN messages dm ON dm.conversation_id = dc.id AND dm.sender_id = ${r}.id
      WHERE dc.type = 'direct' AND dc.user_a_id = LEAST(${senderSql}::int, ${r}.id) AND dc.user_b_id = GREATEST(${senderSql}::int, ${r}.id)
    ))`;
}

async function canMessage(senderId, recipientId) {
  const result = await db.query(`SELECT ${canMessageSql('$1', 'r')} AS allowed FROM users r WHERE r.id = $2`, [senderId, recipientId]);
  return Boolean(result.rows[0]?.allowed);
}

async function assertCanMessage(senderId, recipientId) {
  if (!(await canMessage(senderId, recipientId))) throw new InteractionError("This person isn't accepting messages from you");
}

// May `commenterId` comment on a post by `ownerId`? (Group and page posts
// are the group's / page's: callers skip this for them.)
async function assertCanComment(commenterId, ownerId) {
  if (commenterId === ownerId) return;
  const result = await db.query(
    `SELECT o.comment_permission = 'everyone'
       OR (o.comment_permission = 'followers' AND ${follows('$1', 'o.id')})
       OR (o.comment_permission = 'following' AND ${follows('o.id', '$1')}) AS allowed
     FROM users o WHERE o.id = $2`,
    [commenterId, ownerId]
  );
  if (!result.rows[0]?.allowed) throw new InteractionError('This person limits who can comment on their posts');
}

module.exports = { MESSAGE_PERMISSIONS, COMMENT_PERMISSIONS, InteractionError, canMessage, canMessageSql, assertCanMessage, assertCanComment };
