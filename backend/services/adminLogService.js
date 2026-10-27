// Day 63: the admin audit log -- every moderation decision, who made it
// and when (Admin > Log). Written with the decision itself, in the same
// transaction, so neither exists without the other. It names the account,
// group or page concerned, never the removed content.
const db = require('../db');

// Day 103: 'admin_search' -- an admin searched posts, comments or accounts.
const ACTIONS = ['report_dismissed', 'content_removed', 'user_banned', 'user_suspended', 'user_unbanned', 'error_resolved', 'admin_search'];
const PAGE_SIZE = 30;
const LABEL_MAX = 120;

// q: the transaction's client (or db). details: { reportId,
// reportsResolved, days, reason } -- whichever apply.
async function record(q, { adminId, action, targetType, targetId, targetLabel = null, details = {} }) {
  await q.query(
    `INSERT INTO admin_actions (admin_id, admin_username, action, target_type, target_id, target_label, details)
     SELECT id, username, $2, $3, $4, $5, $6 FROM users WHERE id = $1`,
    [adminId, action, targetType, String(targetId), targetLabel ? [...targetLabel].slice(0, LABEL_MAX).join('') : null, details]
  );
}

// Who a report's target belongs to, for the log's label: the account
// (a user report, or whoever wrote the post / comment / message), or the
// group's or page's name.
async function labelOfReportTarget(q, report) {
  if (report.target_type === 'community') return (await q.query('SELECT name FROM communities WHERE id = $1', [report.target_id])).rows[0]?.name ?? null;
  if (report.target_type === 'page') return (await q.query('SELECT name FROM pages WHERE id = $1', [report.target_id])).rows[0]?.name ?? null;
  const owner = report.target_type === 'user'
    ? report.target_id
    : report.target_type === 'post'
      ? (await q.query('SELECT user_id FROM posts WHERE id = $1', [report.target_id])).rows[0]?.user_id ?? report.target_owner_id
      : report.target_owner_id;
  if (!owner) return null;
  return (await q.query('SELECT username FROM users WHERE id = $1', [owner])).rows[0]?.username ?? null;
}

// Newest first, PAGE_SIZE at a time; optionally one kind of action.
async function list({ page = 1, action = null } = {}) {
  const result = await db.query(
    `SELECT id, admin_id, admin_username, action, target_type, target_id, target_label, details, created_at
     FROM admin_actions WHERE ($1::text IS NULL OR action = $1)
     ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [action, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE]
  );
  const hasMore = result.rows.length > PAGE_SIZE;
  return { actions: hasMore ? result.rows.slice(0, PAGE_SIZE) : result.rows, hasMore, page };
}

// Runs fn(client) in one transaction; returns what it returns.
async function inTransaction(fn) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { record, labelOfReportTarget, list, inTransaction, ACTIONS, PAGE_SIZE };
