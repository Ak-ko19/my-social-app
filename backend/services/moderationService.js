const db = require('../db');

// Day 12: bans and suspensions. A suspension is a ban with an end time
// (users.banned_until); NULL there means a permanent ban.
//
// An expired suspension is lifted wherever it is noticed first: the user's
// next request (sessionService.authorize), their next login, or the daily
// cleanup job. Lifting does what an unban does -- clears the ban and
// reactivates the account (a ban deactivates it, which hides its content).

const LIFT_SQL = `UPDATE users SET banned_at = NULL, ban_reason = NULL, banned_until = NULL,
    is_deactivated = false, deactivated_at = NULL
  WHERE banned_until IS NOT NULL AND banned_until <= now()`;

// 'none' | 'banned' | 'suspended' for a users row with banned_at +
// banned_until (an expired suspension counts as 'none').
function banState(row, now = new Date()) {
  if (!row || !row.banned_at) return 'none';
  if (!row.banned_until) return 'banned';
  return new Date(row.banned_until) > now ? 'suspended' : 'none';
}

// True if this user had an expired suspension that is now lifted.
async function liftExpiredSuspension(userId) {
  const result = await db.query(`${LIFT_SQL} AND id = $1 RETURNING id`, [userId]);
  return result.rowCount > 0;
}

// Cleanup job: every expired suspension at once. Returns how many.
async function liftExpiredSuspensions() {
  const result = await db.query(LIFT_SQL);
  return result.rowCount;
}

module.exports = { banState, liftExpiredSuspension, liftExpiredSuspensions };
