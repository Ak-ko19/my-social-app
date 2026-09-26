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

// Finds or creates the direct conversation with `userId` -- the backend is
// idempotent (returns the existing conversation if one's already there), so
// this is safe to call every time a "Message" button is tapped rather than
// needing to check first.
export function createConversation(userId, token) {
  return api.post('/conversations', { userId }, authHeaders(token)).then((res) => res.data);
}

// REST fallback for sending a message when the socket is disconnected --
// persists identically to the socket send_message path (same backend
// service function), so a caller can't tell which transport was used from
// the response shape alone.
// replyToMessageId (optional, B9) makes it a reply.
export function sendMessageRest(conversationId, content, clientTempId, token, replyToMessageId = null) {
  const body = replyToMessageId ? { content, clientTempId, replyToMessageId } : { content, clientTempId };
  return api
    .post(`/conversations/${conversationId}/messages`, body, authHeaders(token))
    .then((res) => res.data);
}

// B9: REST fallback for editing a message when the socket is down (same
// backend service as the socket 'edit_message' event).
export function editMessageRest(conversationId, messageId, content, token) {
  return api
    .put(`/conversations/${conversationId}/messages/${messageId}`, { content }, authHeaders(token))
    .then((res) => res.data);
}

// B9: image message (multipart 'image'; optional caption / reply target).
// Always REST, like voice -- a file isn't something you emit over the
// socket. The backend broadcasts new_message once it's saved.
export function sendImageMessageRest(conversationId, file, clientTempId, token, { caption, replyToMessageId, onUploadProgress } = {}) {
  const formData = new FormData();
  formData.append('image', file);
  if (clientTempId) formData.append('clientTempId', clientTempId);
  if (caption) formData.append('caption', caption);
  if (replyToMessageId) formData.append('replyToMessageId', String(replyToMessageId));
  return api
    .post(`/conversations/${conversationId}/messages/image`, formData, { ...authHeaders(token), onUploadProgress })
    .then((res) => res.data);
}

export function markConversationRead(conversationId, token) {
  return api.put(`/conversations/${conversationId}/read`, {}, authHeaders(token));
}

// REST fallback for deleting a message when the socket is disconnected --
// same backend service function as the socket path, so the response shape
// (the updated, content-scrubbed message row) matches either way.
export function deleteMessageRest(conversationId, messageId, token) {
  return api
    .delete(`/conversations/${conversationId}/messages/${messageId}`, authHeaders(token))
    .then((res) => res.data);
}

// Uploads a recorded voice message (multipart, field name 'audio' -- must
// match backend/middleware upload chain's uploadAudio.single('audio')).
// There is no socket path for this: an audio Blob isn't something you emit
// over the socket, so this is always REST. The backend itself broadcasts
// new_message once the Cloudinary upload + DB write both succeed, the same
// event the text send path already listens for.
//
// clientTempId travels alongside the file (multer puts it on req.body, same
// as content/clientTempId already do for the JSON text-send body) and comes
// back on the saved row/broadcast, so the sender's own optimistic bubble can
// be matched and deduplicated against that broadcast exactly like a text
// send's socket ack -- same mechanism, just carried over multipart instead
// of a socket payload.
export function sendVoiceMessageRest(conversationId, blob, clientTempId, token, { onUploadProgress } = {}) {
  const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
  const formData = new FormData();
  formData.append('audio', blob, `voice-message.${extension}`);
  if (clientTempId) {
    formData.append('clientTempId', clientTempId);
  }
  return api
    .post(`/conversations/${conversationId}/messages/voice`, formData, {
      ...authHeaders(token),
      onUploadProgress
    })
    .then((res) => res.data);
}
