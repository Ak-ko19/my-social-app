const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');
const adminLog = require('../services/adminLogService');

// Day 10: the admin error log (error_groups, one row per distinct error).

// GET /admin/errors?status=open|resolved&page=&limit= -- most recent first.
async function listErrors(req, res) {
  try {
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const { page, limit, offset } = getPagination(req, { defaultLimit: 50, maxLimit: 100 });
    const result = await db.query(
      `SELECT e.fingerprint, e.source, e.route, e.message, e.stack, e.status, e.count,
              e.first_seen, e.last_seen, e.resolved_at, u.username AS last_username
       FROM error_groups e
       LEFT JOIN users u ON u.id = e.last_user_id
       WHERE ${status === 'open' ? 'e.resolved_at IS NULL' : 'e.resolved_at IS NOT NULL'}
       ORDER BY e.last_seen DESC
       LIMIT $1 OFFSET $2`,
      [limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    res.json({ page, limit, hasMore, errors: hasMore ? result.rows.slice(0, limit) : result.rows });
  } catch (err) {
    sendServerError(res, err, 'Loading the error log failed. Please try again later.');
  }
}

// POST /admin/errors/:fingerprint/resolve -- it re-opens by itself if the
// error happens again (see errorLogService).
async function resolveError(req, res) {
  try {
    // Day 63: in the audit log too, in the same transaction.
    const resolved = await adminLog.inTransaction(async (q) => {
      const result = await q.query(
        'UPDATE error_groups SET resolved_at = now() WHERE fingerprint = $1 AND resolved_at IS NULL RETURNING fingerprint, message',
        [req.params.fingerprint]
      );
      if (result.rows.length === 0) return false;
      const { fingerprint, message } = result.rows[0];
      await adminLog.record(q, { adminId: req.userId, action: 'error_resolved', targetType: 'error', targetId: fingerprint, targetLabel: message });
      return true;
    });
    if (!resolved) return res.status(404).send('Error not found');
    res.json({ ok: true });
  } catch (err) {
    sendServerError(res, err, 'Updating the error log failed. Please try again later.');
  }
}

module.exports = { listErrors, resolveError };
