// Single source of truth for "is there a block between these two users" --
// every place that needs to hide content, prevent a follow, or prevent a
// message because of a block (feed/post queries, followController,
// messageService, conversationController) calls into this instead of
// querying the blocks table directly, so the bidirectional semantics (a
// block hides/blocks in BOTH directions, regardless of who blocked whom)
// can't drift between call sites.
const db = require('../db');

async function isBlocked(userAId, userBId) {
  const result = await db.query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userAId, userBId]
  );
  return result.rows.length > 0;
}

// Only checks the one direction (did blockerId block blockedId) -- used by
// getBlockedUsers/unblock, where the direction genuinely matters (you can
// only unblock someone YOU blocked, not have yourself un-blocked by them).
async function hasBlocked(blockerId, blockedId) {
  const result = await db.query(
    'SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [blockerId, blockedId]
  );
  return result.rows.length > 0;
}

module.exports = { isBlocked, hasBlocked };
