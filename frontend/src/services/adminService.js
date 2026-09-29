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
