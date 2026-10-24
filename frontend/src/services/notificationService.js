import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function fetchUnreadCount(token) {
  return api
    .get('/notifications/unread-count', authHeaders(token))
    .then((res) => res.data.unreadCount);
}

// Day 81: one page of (grouped) notifications. filter: 'all' | 'unread' |
// 'mentions' | 'follows'. -> { notifications, nextCursor }
export function fetchNotifications(token, { filter = 'all', cursor = null } = {}) {
  const params = { filter };
  if (cursor) params.cursor = cursor;
  return api.get('/notifications', { ...authHeaders(token), params }).then((res) => res.data);
}

// Marks a notification read -- with its whole group (Day 81).
export function markNotificationRead(id, token) {
  return api.put(`/notifications/${id}/read`, {}, authHeaders(token)).then((res) => res.data);
}

export function markAllNotificationsRead(token) {
  return api.put('/notifications/read-all', {}, authHeaders(token));
}
