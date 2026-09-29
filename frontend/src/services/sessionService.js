import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 8: where you're logged in (backend routes/sessionRoutes.js).
export function fetchSessions(token) {
  return api.get('/sessions', authHeaders(token)).then((res) => res.data.sessions);
}

// -> { current }: true when it was this device's own session.
export function revokeSession(id, token) {
  return api.delete(`/sessions/${id}`, authHeaders(token)).then((res) => res.data);
}

export function revokeOtherSessions(token) {
  return api.post('/sessions/revoke-others', {}, authHeaders(token)).then((res) => res.data);
}

// Ends this device's session on the server. Best-effort: logging out must
// work even offline, so callers clear the browser session regardless.
export function logoutOnServer(token) {
  return api.post('/logout', {}, { ...authHeaders(token), timeout: 5000 });
}
