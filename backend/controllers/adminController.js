const db = require('../db');
const { sendError } = require('../utils/httpError');
const { mediaOfPost, mediaOfCommunity, mediaOfPage, deleteMedia } = require('../services/mediaCleanupService');
const { getIO } = require('../sockets');
const messageService = require('../services/messageService');
const logger = require('../utils/logger');
const adminLog = require('../services/adminLogService');

const { inTransaction } = adminLog;

// B12 admin moderation. All routes sit behind authMiddleware + requireAdmin.
//
// Acting on a report resolves EVERY pending report about the same target
// (five people reporting one post is one decision, not five), recording
// who, when and how (reports.resolved_*).

const REPORTS_PAGE_SIZE = 20;

// q: the action's transaction (Day 63). Returns how many reports it closed.
async function resolvePending(q, where, params, adminId, resolution) {
  const result = await q.query(
    `UPDATE reports SET status = 'reviewed', resolution = $${params.length + 1}, resolved_by = $${params.length + 2}, resolved_at = now()
     WHERE status = 'pending' AND (${where})`,
    [...params, resolution, adminId]
  );
  return result.rowCount;
}

// GET /admin/reports?status=pending|reviewed&page=N
// Each report comes with a summary of its target (post text + author, or
// the reported account) and how many pending reports share that target.
// Day 12: a comment or message report shows that one comment/message (and
// who wrote it) -- never the rest of the conversation. If it has since
// been deleted, target_snapshot still has the text as reported.
function targetExists(r) {
  if (r.target_type === 'post') return r.post_author_id !== null;
  if (r.target_type === 'comment') return r.comment_content !== null;
  if (r.target_type === 'message') return r.message_type !== null;
  if (r.target_type === 'community') return r.community_name !== null;
  if (r.target_type === 'page') return r.page_name !== null;
  return r.target_username !== null;
}

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
         tu.username AS target_username, (tu.banned_at IS NOT NULL) AS target_banned, tu.banned_until AS target_banned_until,
         r.target_snapshot, r.target_owner_id, owner.username AS target_owner_username,
         (owner.banned_at IS NOT NULL) AS target_owner_banned, owner.banned_until AS target_owner_banned_until,
         c.content AS comment_content, c.post_id AS comment_post_id,
         m.content AS message_content, m.type AS message_type, m.media_url AS message_media_url,
         co.name AS community_name, co.privacy AS community_privacy, pg.name AS page_name,
         (SELECT COUNT(*)::int FROM reports r2
            WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id AND r2.status = 'pending') AS pending_for_target
       FROM reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users resolver ON resolver.id = r.resolved_by
       LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
       LEFT JOIN users pa ON pa.id = p.user_id
       LEFT JOIN users tu ON r.target_type = 'user' AND tu.id = r.target_id
       LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
       LEFT JOIN messages m ON r.target_type = 'message' AND m.id = r.target_id AND m.deleted_at IS NULL
       LEFT JOIN communities co ON r.target_type = 'community' AND co.id = r.target_id
       LEFT JOIN pages pg ON r.target_type = 'page' AND pg.id = r.target_id
       LEFT JOIN users owner ON owner.id = r.target_owner_id
       WHERE r.status = $1
       ORDER BY r.created_at ${status === 'pending' ? 'ASC' : 'DESC'}, r.id
       LIMIT $2 OFFSET $3`,
      [status, REPORTS_PAGE_SIZE + 1, (page - 1) * REPORTS_PAGE_SIZE]
    );
    const hasMore = result.rows.length > REPORTS_PAGE_SIZE;
    const reports = (hasMore ? result.rows.slice(0, REPORTS_PAGE_SIZE) : result.rows).map((r) => ({
      ...r,
      post_content: r.post_content ? r.post_content.slice(0, 300) : r.post_content,
      comment_content: r.comment_content ? r.comment_content.slice(0, 300) : r.comment_content,
      message_content: r.message_content ? r.message_content.slice(0, 300) : r.message_content,
      target_exists: targetExists(r)
    }));
    res.json({ reports, hasMore, page });
  } catch (err) {
    sendError(res, err, 'Loading reports failed. Please try again later.');
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
    await inTransaction(async (q) => {
      const closed = await resolvePending(q, 'target_type = $1 AND target_id = $2', [report.target_type, report.target_id], req.userId, 'dismissed');
      await adminLog.record(q, {
        adminId: req.userId,
        action: 'report_dismissed',
        targetType: report.target_type,
        targetId: report.target_id,
        targetLabel: await adminLog.labelOfReportTarget(q, report),
        details: { reportId: report.id, reportsResolved: closed }
      });
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Dismissing the report failed. Please try again later.');
  }
}

// POST /admin/reports/:id/remove-content -- deletes the reported post,
// comment (its replies and likes go with it) or message (Day 12: removed
// like an unsend -- the chat shows "message deleted" -- and its photo or
// voice note is deleted from Cloudinary).
async function removeReportedContent(req, res) {
  try {
    const report = await getReport(req.params.id);
    if (!report) return res.status(404).send('Report not found');
    if (report.target_type === 'user') return res.status(400).send('Accounts cannot be removed here; ban or suspend the user instead');
    // Day 63: the removal, its reports and the log entry are one
    // transaction; photos and voice notes are deleted (from Cloudinary,
    // which can't be undone) only once it has committed.
    let media = [];
    const removed = await inTransaction(async (q) => {
      // The label first: whose content (or which group / page) it was.
      const targetLabel = await adminLog.labelOfReportTarget(q, report);
      let message = null;
      if (report.target_type === 'post') {
        media = await mediaOfPost(report.target_id);
        await q.query('DELETE FROM posts WHERE id = $1', [report.target_id]);
      } else if (report.target_type === 'comment') {
        await q.query('DELETE FROM comments WHERE id = $1', [report.target_id]);
      } else if (report.target_type === 'community') {
        // Day 24: the whole group -- its posts (and their photos) go with it.
        media = await mediaOfCommunity(report.target_id);
        await q.query('DELETE FROM communities WHERE id = $1', [report.target_id]);
      } else if (report.target_type === 'page') {
        media = await mediaOfPage(report.target_id);
        await q.query('DELETE FROM pages WHERE id = $1', [report.target_id]);
      } else {
        message = await messageService.removeMessageAsModerator(report.target_id, { q, deleteMediaNow: false });
        if (message?.media_url) media = [message.media_url];
      }
      const closed = await resolvePending(q, 'target_type = $1 AND target_id = $2', [report.target_type, report.target_id], req.userId, 'content_removed');
      await adminLog.record(q, {
        adminId: req.userId,
        action: 'content_removed',
        targetType: report.target_type,
        targetId: report.target_id,
        targetLabel,
        details: { reportId: report.id, reportsResolved: closed }
      });
      return message;
    });
    deleteMedia(media);
    if (removed) {
      try {
        getIO().to(`conv_${removed.conversation_id}`).emit('message_deleted', {
          conversationId: removed.conversation_id,
          messageId: removed.id,
          deletedAt: removed.deleted_at
        });
      } catch (err) {
        logger.error('socket emit failed', { event: 'message_deleted', err });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Removing the content failed. Please try again later.');
  }
}

// Day 12 suspensions: how long an admin may choose.
const SUSPEND_DAYS = [1, 3, 7, 30];

// POST /admin/users/:id/ban { reason } -- also deactivates (hides their
// content everywhere via the existing visibility rules), ends their live
// socket sessions, and resolves pending reports about them or anything they
// wrote (posts, comments, messages).
// POST /admin/users/:id/suspend { days, reason } -- the same for a limited
// time: lifted by itself afterwards (services/moderationService.js).
function banUser(req, res) {
  return restrictUser(req, res, null);
}

function suspendUser(req, res) {
  const days = Number(req.body?.days);
  if (!SUSPEND_DAYS.includes(days)) {
    return res.status(400).send(`days must be one of: ${SUSPEND_DAYS.join(', ')}`);
  }
  return restrictUser(req, res, days);
}

async function restrictUser(req, res, days) {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) return res.status(400).send('Invalid user ID');
    if (targetId === req.userId) return res.status(400).send("You can't ban yourself");
    const target = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [targetId]);
    if (!target.rows[0]) return res.status(404).send('User not found');
    if (target.rows[0].is_admin) return res.status(400).send("Admins can't be banned here -- remove their admin role first");

    // The reason is optional -- and under Express 5, req.body is undefined
    // when a request has no body at all, so never dereference it directly.
    const rawReason = req.body?.reason;
    const reason = typeof rawReason === 'string' ? rawReason.trim().slice(0, 500) : '';
    // A ban replaces any suspension (banned_until NULL); a suspension
    // replaces an earlier one or even a ban -- the admin's latest decision.
    const action = days === null ? 'user_banned' : 'user_suspended';
    await inTransaction(async (q) => {
      await q.query(
        `UPDATE users SET banned_at = COALESCE(banned_at, now()), ban_reason = $2,
           banned_until = CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(days => $3::int) END,
           is_deactivated = true, deactivated_at = COALESCE(deactivated_at, now())
         WHERE id = $1`,
        [targetId, reason || null, days]
      );
      const closed = await resolvePending(
        q,
        `(target_type = 'user' AND target_id = $1) OR (target_type = 'post' AND target_id IN (SELECT id FROM posts WHERE user_id = $1))
         OR target_owner_id = $1`,
        [targetId],
        req.userId,
        action
      );
      // Day 63: in the log, with the reason the admin gave.
      await adminLog.record(q, {
        adminId: req.userId,
        action,
        targetType: 'user',
        targetId,
        targetLabel: target.rows[0].username,
        details: { ...(days === null ? {} : { days }), ...(reason ? { reason } : {}), reportsResolved: closed }
      });
    });
    try {
      getIO().in(`user_${targetId}`).disconnectSockets(true);
    } catch (err) {
      // No socket server (tests) -- their next request is refused anyway.
    }
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, days === null ? 'Banning the user failed. Please try again later.' : 'Suspending the user failed. Please try again later.');
  }
}

// POST /admin/users/:id/unban -- also lifts a suspension early.
async function unbanUser(req, res) {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) return res.status(400).send('Invalid user ID');
    const lifted = await inTransaction(async (q) => {
      const result = await q.query(
        `UPDATE users SET banned_at = NULL, ban_reason = NULL, banned_until = NULL, is_deactivated = false, deactivated_at = NULL
         WHERE id = $1 AND banned_at IS NOT NULL RETURNING id, username`,
        [targetId]
      );
      if (result.rows.length === 0) return false;
      await adminLog.record(q, { adminId: req.userId, action: 'user_unbanned', targetType: 'user', targetId, targetLabel: result.rows[0].username });
      return true;
    });
    if (!lifted) return res.status(404).send('That user is not banned');
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Unbanning the user failed. Please try again later.');
  }
}

module.exports = { listReports, dismissReport, removeReportedContent, banUser, suspendUser, unbanUser };
