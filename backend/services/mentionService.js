// Parses @mentions out of post/comment content and creates a 'mention'
// notification for each valid, distinct mentioned user -- reuses the
// existing notifications table/shape (user_id, actor_id, type, post_id,
// comment_id) rather than a new table, same as 'like'/'comment'/'follow'.
const db = require('../db');
const { noBlockBetweenSql } = require('../services/blockService');
const { getVisiblePost } = require('./postVisibilityService');
const { pushNotification } = require('./pushService');
const { allowedSql } = require('./notificationService');
const { notRestrictedSql } = require('./restrictService');

// Day 43: names in any script (see hashtagService's HASHTAG_REGEX).
const MENTION_REGEX = /@([\p{L}\p{M}\p{N}_]+)/gu;
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
// excludeUserIds: people already notified about this same comment another
// way (e.g. the 'reply' recipient, whose @mention is pre-filled by the
// reply UI) -- one action should produce one notification per person.
async function notifyMentions({ content, authorId, postId, commentId = null, excludeUserIds = [] }) {
  const usernames = parseMentionUsernames(content);
  if (usernames.length === 0) return;

  // Excludes a mentioned user who has blocked the author (or vice versa) --
  // same mutual-invisibility rule every other cross-user notification/
  // interaction in this app already respects.
  const usersResult = await db.query(
    `SELECT id FROM users
     WHERE LOWER(username) = ANY($1::text[]) AND id != $2
       AND id != ALL($3::int[])
       -- B11: respect the recipient's notification settings.
       AND ${allowedSql('mentions', 'users.id')}
       -- Day 47: not someone who restricted the author.
       AND ${notRestrictedSql('users.id', '$2')}
       AND ${noBlockBetweenSql('$2', 'users.id')}`,
    [usernames, authorId, excludeUserIds]
  );
  // Day 20: only people who can see the post (a followers-only post's
  // non-followers, or anyone at all for an "only me" post, would get a
  // notification for something they can't open).
  const recipients = [];
  for (const row of usersResult.rows) {
    if (await getVisiblePost(postId, row.id)) recipients.push(row);
  }
  if (recipients.length === 0) return;

  const placeholders = recipients.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, 'mention', $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');
  const params = recipients.flatMap((row) => [row.id, authorId, postId, commentId]);
  await db.query(
    `INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id) VALUES ${placeholders}`,
    params
  );
  // Day 22: and a push to each of them.
  for (const row of recipients) pushNotification({ userId: row.id, actorId: authorId, type: 'mention', postId, commentId });
}

module.exports = { parseMentionUsernames, notifyMentions };
