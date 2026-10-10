// Day 50: group rules shared outside the groups controller.
const db = require('../db');

class GroupRuleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function isBanned(communityId, userId) {
  const result = await db.query('SELECT 1 FROM community_bans WHERE community_id = $1 AND user_id = $2', [communityId, userId]);
  return result.rows.length > 0;
}

// Like Facebook: only a group's members comment on and react to its posts
// (anyone may read a public group's). `post` is getVisiblePost's summary.
// Taking back your own reaction or like is always allowed.
function assertCanInteract(post) {
  if (post.community_id && !post.viewer_is_community_member) {
    throw new GroupRuleError(403, 'Join this group to comment and react');
  }
}

module.exports = { isBanned, assertCanInteract, GroupRuleError };
