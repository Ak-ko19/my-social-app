import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 48: your activity log (backend controllers/activityController.js).
// { page, items, hasMore }
export function fetchActivity(kind, token, { page = 1, limit = 20 } = {}) {
  return api.get(`/activity/${kind}`, { ...authHeaders(token), params: { page, limit } }).then((res) => res.data);
}
