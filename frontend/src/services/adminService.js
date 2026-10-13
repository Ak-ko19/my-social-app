import api from '../api';

// B12 admin moderation -- see backend/controllers/adminController.js.
// Non-admins get 404 from every one of these.
const withAuth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export function fetchReports(token, { status = 'pending', page = 1 } = {}) {
  return api.get('/admin/reports', { ...withAuth(token), params: { status, page } }).then((res) => res.data);
}

export function dismissReport(reportId, token) {
  return api.post(`/admin/reports/${reportId}/dismiss`, {}, withAuth(token));
}

export function removeReportedContent(reportId, token) {
  return api.post(`/admin/reports/${reportId}/remove-content`, {}, withAuth(token));
}

export function banUser(userId, reason, token) {
  return api.post(`/admin/users/${userId}/ban`, { reason }, withAuth(token));
}

// Day 12: days is 1, 3, 7 or 30.
export function suspendUser(userId, days, reason, token) {
  return api.post(`/admin/users/${userId}/suspend`, { days, reason }, withAuth(token));
}

export function unbanUser(userId, token) {
  return api.post(`/admin/users/${userId}/unban`, {}, withAuth(token));
}

// Day 10: built-in error log.
export function fetchErrors(token, { status = 'open', page = 1 } = {}) {
  return api.get('/admin/errors', { ...withAuth(token), params: { status, page } }).then((res) => res.data);
}

export function resolveError(fingerprint, token) {
  return api.post(`/admin/errors/${fingerprint}/resolve`, {}, withAuth(token));
}

// Day 57: Admin > Storage -- { database, cloudinary, uploads, warnings,
// warnAt, alertAt } (backend services/storageService.js).
export function fetchStorage(token) {
  return api.get('/admin/storage', withAuth(token)).then((res) => res.data);
}

// Day 61: Admin > Overview -- { days, series: [{ day, signups, posts,
// comments, reports }] oldest first (today last, so far), totals, storage }
// (backend services/statsService.js).
export function fetchOverview(token, days) {
  return api.get('/admin/overview', { ...withAuth(token), params: { days } }).then((res) => res.data);
}

// Day 63: Admin > Log -- { actions, hasMore, page } newest first; action
// narrows it to one kind (backend services/adminLogService.js).
export function fetchAdminLog(token, { action = '', page = 1 } = {}) {
  return api.get('/admin/log', { ...withAuth(token), params: { page, ...(action ? { action } : {}) } }).then((res) => res.data);
}
