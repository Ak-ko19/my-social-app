// B12: is this account banned? Checked by every auth entry point
// (authMiddleware, optionalAuth, socketAuth, login) so a ban takes effect
// immediately -- even for a still-valid JWT issued before the ban.
//
// Cost: one primary-key lookup per authenticated request. Fine at MVP
// scale; if it ever shows up in profiles, cache it briefly (a ban can
// tolerate a few seconds of delay) rather than dropping the check.
const db = require('../db');

async function isBanned(userId) {
  if (!userId) return false;
  const result = await db.query('SELECT banned_at FROM users WHERE id = $1', [userId]);
  return Boolean(result.rows[0]?.banned_at);
}

module.exports = { isBanned };
