// Day 106: page verification (migration 086). A page's owner or admins ask
// for the blue tick; an admin approves or declines it with a reason (Admin
// > Verification), and can take a tick away later. Like Facebook's:
// - the page needs its About text first;
// - one request at a time; after a decline, the page waits WAIT_DAYS to
//   ask again (the latest decision is what counts);
// - a verified page that is renamed loses the tick (pageController.
//   updatePage), so a verified page can't become someone else's.
// Each decision, its log entry (adminLogService) and the request's new
// state are one transaction; the page's managers are told afterwards.
const db = require('../db');
const { HttpError } = require('../utils/httpError');
const { textOf } = require('../utils/bodyText');
const { toUnicode } = require('../utils/myanmarText'); // Day 43: Zawgyi -> Unicode
const adminLog = require('./adminLogService');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const NOTE_MAX = 500;
const LINK_MAX = 300;
const WAIT_DAYS = 30;
const REASONS = ['incomplete', 'not_notable', 'impersonation', 'other'];
const STATUSES = ['pending', 'reviewed'];
const PAGE_SIZE = 20;

class VerificationError extends HttpError {}

const REQUEST_COLUMNS = 'r.id, r.status, r.note, r.link, r.created_at, r.decided_at, r.decline_reason';

// What the page's managers see: { verified_at, request (the latest, or
// null), removed (null | 'admin' | 'renamed': an approved page that lost
// its tick since), can_request, why_not (null | 'verified' | 'pending' |
// 'wait' | 'no_about'), next_request_at (while waiting) }. The wait runs
// from the latest decline or the latest removal by an admin.
async function stateOf(page) {
  const result = await db.query(
    `SELECT p.verified_at, p.verification_removed_at, p.description,
       (SELECT row_to_json(x) FROM (
          SELECT ${REQUEST_COLUMNS} FROM page_verification_requests r WHERE r.page_id = p.id
          ORDER BY r.created_at DESC, r.id DESC LIMIT 1) x) AS request,
       GREATEST(
         (SELECT max(r.decided_at) FROM page_verification_requests r WHERE r.page_id = p.id AND r.status = 'declined'),
         p.verification_removed_at
       ) + make_interval(days => $2) AS wait_until,
       now() AS now
     FROM pages p WHERE p.id = $1`,
    [page.id, WAIT_DAYS]
  );
  const row = result.rows[0];
  const { request } = row;
  const nextRequestAt = row.wait_until && row.wait_until > row.now ? row.wait_until : null;
  let removed = null;
  if (!row.verified_at && request?.status === 'approved') {
    removed = row.verification_removed_at && row.verification_removed_at >= new Date(request.decided_at) ? 'admin' : 'renamed';
  }
  let whyNot = null;
  if (row.verified_at) whyNot = 'verified';
  else if (request?.status === 'pending') whyNot = 'pending';
  else if (nextRequestAt) whyNot = 'wait';
  else if (!row.description || !row.description.trim()) whyNot = 'no_about';
  return { verified_at: row.verified_at, request, removed, can_request: whyNot === null, why_not: whyNot, next_request_at: nextRequestAt };
}

// An optional web address: http(s) only, at most LINK_MAX characters.
// Left out, null or blank: none; anything that isn't text is refused.
function cleanLink(value) {
  if (value === undefined || value === null) return null;
  const link = textOf(value).trim();
  if (!link && typeof value === 'string') return null;
  let url;
  try {
    url = new URL(link);
  } catch {
    url = null;
  }
  if (!url || !['http:', 'https:'].includes(url.protocol) || link.length > LINK_MAX) {
    throw new VerificationError(400, 'Enter a web address that starts with http:// or https://, up to 300 characters.');
  }
  return link;
}

// POST /pages/:id/verification { note, link? } by one of the page's
// managers (the caller has checked that).
async function request(page, userId, body) {
  const note = toUnicode(textOf(body?.note)).trim();
  if (!note) throw new VerificationError(400, 'Tell us who this page represents.');
  if ([...note].length > NOTE_MAX) throw new VerificationError(400, 'The note must be 500 characters or fewer.');
  const link = cleanLink(body?.link);
  const state = await stateOf(page);
  if (state.why_not === 'verified') throw new VerificationError(409, 'This page is already verified.');
  if (state.why_not === 'pending') throw new VerificationError(409, 'This page already has a request waiting for review.');
  if (state.why_not === 'wait') throw new VerificationError(409, 'A page can ask again 30 days after a request is declined or a tick is removed.');
  if (state.why_not === 'no_about') throw new VerificationError(400, 'Add an About text to the page first.');
  try {
    await db.query(
      'INSERT INTO page_verification_requests (page_id, requested_by, note, link) VALUES ($1, $2, $3, $4)',
      [page.id, userId, note, link]
    );
  } catch (err) {
    // Two managers asking at the same moment: one pending per page.
    if (err.code === '23505') throw new VerificationError(409, 'This page already has a request waiting for review.');
    throw err;
  }
  return stateOf(page);
}

// DELETE /pages/:id/verification -- take back a request still waiting.
// Nothing waiting is fine (it may have just been decided).
async function withdraw(page) {
  await db.query("DELETE FROM page_verification_requests WHERE page_id = $1 AND status = 'pending'", [page.id]);
  return stateOf(page);
}

// GET /admin/page-verifications?status=pending|reviewed&page=N -- the
// waiting ones oldest first; the decided ones newest first.
async function list({ status, page }) {
  const pending = status === 'pending';
  const result = await db.query(
    `SELECT ${REQUEST_COLUMNS},
       asker.username AS requested_by_username, decider.username AS decided_by_username,
       json_build_object(
         'id', p.id, 'name', p.name, 'category', p.category, 'description', left(p.description, 300),
         'created_at', p.created_at, 'verified_at', p.verified_at,
         'owner_id', o.id, 'owner_username', o.username,
         'follower_count', (SELECT COUNT(*) FROM page_follows f WHERE f.page_id = p.id),
         'post_count', (SELECT COUNT(*) FROM posts WHERE posts.page_id = p.id)
       ) AS page,
       (SELECT COUNT(*)::int FROM page_verification_requests d
          WHERE d.page_id = r.page_id AND d.status = 'declined' AND d.id <> r.id) AS other_declines
     FROM page_verification_requests r
     JOIN pages p ON p.id = r.page_id
     JOIN users o ON o.id = p.owner_id
     LEFT JOIN users asker ON asker.id = r.requested_by
     LEFT JOIN users decider ON decider.id = r.decided_by
     WHERE ${pending ? "r.status = 'pending'" : "r.status <> 'pending'"}
     ORDER BY ${pending ? 'r.created_at ASC, r.id ASC' : 'r.decided_at DESC, r.id DESC'}
     LIMIT $1 OFFSET $2`,
    [PAGE_SIZE + 1, (page - 1) * PAGE_SIZE]
  );
  const hasMore = result.rows.length > PAGE_SIZE;
  return { requests: hasMore ? result.rows.slice(0, PAGE_SIZE) : result.rows, hasMore, page };
}

// The page's owner and admins: who hears about a decision.
async function managersOf(pageId) {
  const result = await db.query(
    `SELECT owner_id AS id FROM pages WHERE id = $1
     UNION SELECT user_id FROM page_admins WHERE page_id = $1`,
    [pageId]
  );
  return result.rows.map((r) => r.id);
}

// After the decision has committed: a failed notification doesn't undo it.
async function tellManagers(pageId, type, details) {
  try {
    for (const userId of await managersOf(pageId)) {
      await notificationService.notifySystem({ userId, type, pageId, details });
    }
  } catch (err) {
    logger.error('page verification notification failed', { pageId, type, err });
  }
}

// The request, locked, if it is still waiting -- 404 when there's no such
// request, 409 when another admin got there first.
async function lockPending(q, requestId) {
  const found = await q.query(
    `SELECT r.id, r.status, r.page_id, p.name AS page_name
     FROM page_verification_requests r JOIN pages p ON p.id = r.page_id
     WHERE r.id = $1 FOR UPDATE OF r`,
    [requestId]
  );
  const row = found.rows[0];
  if (!row) throw new VerificationError(404, 'Verification request not found');
  if (row.status !== 'pending') throw new VerificationError(409, 'This request has already been decided.');
  return row;
}

// POST /admin/page-verifications/:id/approve
async function approve(requestId, adminId) {
  const row = await adminLog.inTransaction(async (q) => {
    const r = await lockPending(q, requestId);
    await q.query("UPDATE page_verification_requests SET status = 'approved', decided_by = $2, decided_at = now() WHERE id = $1", [r.id, adminId]);
    await q.query('UPDATE pages SET verified_at = now() WHERE id = $1', [r.page_id]);
    await adminLog.record(q, { adminId, action: 'page_verified', targetType: 'page', targetId: r.page_id, targetLabel: r.page_name, details: { requestId: r.id } });
    return r;
  });
  await tellManagers(row.page_id, 'page_verified', null);
  return { id: row.id, status: 'approved' };
}

function cleanReason(value) {
  if (!REASONS.includes(value)) throw new VerificationError(400, `reason must be one of: ${REASONS.join(', ')}`);
  return value;
}

// POST /admin/page-verifications/:id/decline { reason }
async function decline(requestId, adminId, body) {
  const reason = cleanReason(body?.reason);
  const row = await adminLog.inTransaction(async (q) => {
    const r = await lockPending(q, requestId);
    await q.query(
      "UPDATE page_verification_requests SET status = 'declined', decided_by = $2, decided_at = now(), decline_reason = $3 WHERE id = $1",
      [r.id, adminId, reason]
    );
    await adminLog.record(q, { adminId, action: 'page_declined', targetType: 'page', targetId: r.page_id, targetLabel: r.page_name, details: { requestId: r.id, reason } });
    return r;
  });
  await tellManagers(row.page_id, 'page_not_verified', { reason });
  return { id: row.id, status: 'declined', decline_reason: reason };
}

// POST /admin/pages/:id/unverify { reason } -- takes a page's tick away.
async function unverify(pageId, adminId, body) {
  const reason = cleanReason(body?.reason);
  await adminLog.inTransaction(async (q) => {
    const found = await q.query('SELECT id, name, verified_at FROM pages WHERE id = $1 FOR UPDATE', [pageId]);
    const page = found.rows[0];
    if (!page) throw new VerificationError(404, 'Page not found');
    if (!page.verified_at) throw new VerificationError(409, 'This page is not verified.');
    await q.query('UPDATE pages SET verified_at = NULL, verification_removed_at = now() WHERE id = $1', [page.id]);
    await adminLog.record(q, { adminId, action: 'page_unverified', targetType: 'page', targetId: page.id, targetLabel: page.name, details: { reason } });
  });
  await tellManagers(pageId, 'page_unverified', { reason });
  return { id: pageId, verified_at: null };
}

module.exports = { stateOf, request, withdraw, list, approve, decline, unverify, REASONS, STATUSES, NOTE_MAX, LINK_MAX, WAIT_DAYS, PAGE_SIZE };
