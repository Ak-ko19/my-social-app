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

// REST fallback for sending a message when the socket is disconnected --
// persists identically to the socket send_message path (same backend
// service function), so a caller can't tell which transport was used from
// the response shape alone.
export function sendMessageRest(conversationId, content, clientTempId, token) {
  return api
    .post(`/conversations/${conversationId}/messages`, { content, clientTempId }, authHeaders(token))
    .then((res) => res.data);
}

export function markConversationRead(conversationId, token) {
  return api.put(`/conversations/${conversationId}/read`, {}, authHeaders(token));
}
