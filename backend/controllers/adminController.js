const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { mediaOfPost, deleteMedia } = require('../services/mediaCleanupService');
const { getIO } = require('../sockets');

// B12 admin moderation. All routes sit behind authMiddleware + requireAdmin.
//
// Acting on a report resolves EVERY pending report about the same target
// (five people reporting one post is one decision, not five), recording
// who, when and how (reports.resolved_*).

const REPORTS_PAGE_SIZE = 20;

async function resolvePending(where, params, adminId, resolution) {
  await db.query(
    `UPDATE reports SET status = 'reviewed', resolution = $${params.length + 1}, resolved_by = $${params.length + 2}, resolved_at = now()
     WHERE status = 'pending' AND (${where})`,
    [...params, resolution, adminId]
  );
}

// GET /admin/reports?status=pending|reviewed&page=N
// Each report comes with a summary of its target (post text + author, or
// the reported account) and how many pending reports share that target.
async function listReports(req, res) {
  try {
    const status = req.query.status === 'reviewed' ? 'reviewed' : 'pending';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const result = await db.query(
      `SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at,
         r.resolution, r.resolved_at,
         reporter.id AS reporter_id, reporter.username AS reporter_username,
         resolver.username AS resolved_by_username,
         p.content AS post_content, p.user_id AS post_author_id, pa.username AS post_author_username,
         tu.username AS target_username, (tu.banned_at IS NOT NULL) AS target_banned,
         (SELECT COUNT(*)::int FROM reports r2
            WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id AND r2.status = 'pending') AS pending_for_target
       FROM reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users resolver ON resolver.id = r.resolved_by
       LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
       LEFT JOIN users pa ON pa.id = p.user_id
       LEFT JOIN users tu ON r.target_type = 'user' AND tu.id = r.target_id
       WHERE r.status = $1
       ORDER BY r.created_at ${status === 'pending' ? 'ASC' : 'DESC'}, r.id
       LIMIT $2 OFFSET $3`,
      [status, REPORTS_PAGE_SIZE + 1, (page - 1) * REPORTS_PAGE_SIZE]
    );
    const hasMore = result.rows.length > REPORTS_PAGE_SIZE;
    const reports = (hasMore ? result.rows.slice(0, REPORTS_PAGE_SIZE) : result.rows).map((r) => ({
      ...r,
      post_content: r.post_content ? r.post_content.slice(0, 300) : r.post_content,
      target_exists: r.target_type === 'post' ? r.post_author_id !== null : r.target_username !== null
    }));
    res.json({ reports, hasMore, page });
  } catch (err) {
    sendServerError(res, err, 'Loading reports failed. Please try again later.');
  }
}

async function getReport(id) {
  const result = await db.query('SELECT * FROM reports WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// POST /admin/reports/:id/dismiss -- nothing wrong; resolves all pending
// reports on the same target.
async function dismissReport(req, res) {
  try {
    const report = await getReport(req.params.id);
    if (!report) return res.status(404).send('Report not found');
    await resolvePending('target_type = $1 AND target_id = $2', [report.target_type, report.target_id], req.userId, 'dismissed');
    res.json({ ok: true });
  } catch (err) {
    sendServerError(res, err, 'Dismissing the report failed. Please try again later.');
  }
}

// POST /admin/reports/:id/remove-content -- deletes the reported post.
async function removeReportedContent(req, res) {
  try {
    const report = await getReport(req.params.id);
    if (!report) return res.status(404).send('Report not found');
    if (report.target_type !== 'post') return res.status(400).send('Only posts can be removed; ban the user instead');
    const media = await mediaOfPost(report.target_id);
    await db.query('DELETE FROM posts WHERE id = $1', [report.target_id]);
    deleteMedia(media);
    await resolvePending("target_type = 'post' AND target_id = $1", [report.target_id], req.userId, 'content_removed');
    res.json({ ok: true });
  } catch (err) {
    sendServerError(res, err, 'Removing the post failed. Please try again later.');
  }
}

// POST /admin/users/:id/ban { reason } -- also deactivates (hides their
// content everywhere via the existing visibility rules), ends their live
// socket sessions, and resolves pending reports about them or their posts.
async function banUser(req, res) {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) return res.status(400).send('Invalid user ID');
    if (targetId === req.userId) return res.status(400).send("You can't ban yourself");
    const target = await db.query('SELECT id, is_admin FROM users WHERE id = $1', [targetId]);
    if (!target.rows[0]) return res.status(404).send('User not found');
    if (target.rows[0].is_admin) return res.status(400).send("Admins can't be banned here -- remove their admin role first");

    // The reason is optional -- and under Express 5, req.body is undefined
    // when a request has no body at all, so never dereference it directly.
    const rawReason = req.body?.reason;
    const reason = typeof rawReason === 'string' ? rawReason.trim().slice(0, 500) : '';
    await db.query(
      `UPDATE users SET banned_at = COALESCE(banned_at, now()), ban_reason = $2,
         is_deactivated = true, deactivated_at = COALESCE(deactivated_at, now())
       WHERE id = $1`,
      [targetId, reason || null]
    );
    await resolvePending(
      "(target_type = 'user' AND target_id = $1) OR (target_type = 'post' AND target_id IN (SELECT id FROM posts WHERE user_id = $1))",
      [targetId],
      req.userId,
      'user_banned'
    );
    try {
      getIO().in(`user_${targetId}`).disconnectSockets(true);
    } catch (err) {
      // No socket server (tests) -- their next request is refused anyway.
    }
    res.json({ ok: true });
  } catch (err) {
    sendServerError(res, err, 'Banning the user failed. Please try again later.');
  }
}

// POST /admin/users/:id/unban
async function unbanUser(req, res) {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) return res.status(400).send('Invalid user ID');
    const result = await db.query(
      `UPDATE users SET banned_at = NULL, ban_reason = NULL, is_deactivated = false, deactivated_at = NULL
       WHERE id = $1 AND banned_at IS NOT NULL RETURNING id`,
      [targetId]
    );
    if (result.rows.length === 0) return res.status(404).send('That user is not banned');
    res.json({ ok: true });
  } catch (err) {
    sendServerError(res, err, 'Unbanning the user failed. Please try again later.');
  }
}

module.exports = { listReports, dismissReport, removeReportedContent, banUser, unbanUser };
