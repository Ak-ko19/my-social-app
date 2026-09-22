// Parses @mentions out of post/comment content and creates a 'mention'
// notification for each valid, distinct mentioned user -- reuses the
// existing notifications table/shape (user_id, actor_id, type, post_id,
// comment_id) rather than a new table, same as 'like'/'comment'/'follow'.
const db = require('../db');

const MENTION_REGEX = /@(\w+)/g;
const MAX_USERNAME_LENGTH = 50; // matches users.username's practical length

function parseMentionUsernames(content) {
  if (!content) return [];
  const matches = content.matchAll(MENTION_REGEX);
  const usernames = new Set();
  for (const match of matches) {
    const username = match[1].slice(0, MAX_USERNAME_LENGTH);
    if (username) usernames.add(username.toLowerCase());
  }
  return [...usernames];
}

// Creates mention notifications for a newly created post or comment.
// authorId is excluded (mentioning yourself doesn't notify you); postId is
// always required (a mention notification always points at a post, same as
// 'comment'), commentId is only set when the mention came from a comment.
async function notifyMentions({ content, authorId, postId, commentId = null }) {
  const usernames = parseMentionUsernames(content);
  if (usernames.length === 0) return;

  // Excludes a mentioned user who has blocked the author (or vice versa) --
  // same mutual-invisibility rule every other cross-user notification/
  // interaction in this app already respects.
  const usersResult = await db.query(
    `SELECT id FROM users
     WHERE LOWER(username) = ANY($1::text[]) AND id != $2
       AND NOT EXISTS (
         SELECT 1 FROM blocks
         WHERE (blocker_id = $2 AND blocked_id = users.id)
            OR (blocker_id = users.id AND blocked_id = $2)
       )`,
    [usernames, authorId]
  );
  if (usersResult.rows.length === 0) return;

  const placeholders = usersResult.rows.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, 'mention', $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');
  const params = usersResult.rows.flatMap((row) => [row.id, authorId, postId, commentId]);
  await db.query(
    `INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id) VALUES ${placeholders}`,
    params
  );
}

module.exports = { parseMentionUsernames, notifyMentions };
