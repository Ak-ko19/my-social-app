import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Cursor-paginated message history (see backend utils/cursorPagination.js).
// Omitting `cursor` fetches the newest page.
export function fetchMessages(conversationId, token, { cursor, limit = 20 } = {}) {
  return api
    .get(`/conversations/${conversationId}/messages`, { ...authHeaders(token), params: { cursor, limit } })
    .then((res) => res.data);
}

// One row per conversation: other participant's info, last message preview,
// and unread count -- already sorted most-recent-first by the backend.
export function fetchConversations(token) {
  return api.get('/conversations', authHeaders(token)).then((res) => res.data);
}
