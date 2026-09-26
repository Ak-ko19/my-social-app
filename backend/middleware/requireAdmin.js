const db = require('../db');

// B12: use after authMiddleware. Re-reads users.is_admin on every request
// (never trusts a token claim), so revoking admin takes effect immediately.
// Non-admins get 404, not 403 -- the admin API shouldn't advertise itself.
async function requireAdmin(req, res, next) {
  try {
    const result = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0]?.is_admin) {
      return res.status(404).send('Not found');
    }
    next();
  } catch (err) {
    console.error('requireAdmin failed:', err.message);
    res.status(500).send('Something went wrong. Please try again later.');
  }
}

module.exports = requireAdmin;
