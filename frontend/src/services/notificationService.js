import api from '../api';

export function fetchUnreadCount(token) {
  return api
    .get('/notifications/unread-count', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then((res) => res.data.unreadCount);
}
