import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function changePassword(currentPassword, newPassword, token) {
  return api.put('/profile/password', { currentPassword, newPassword }, authHeaders(token));
}

export function deactivateAccount(password, token) {
  return api.post('/profile/deactivate', { password }, authHeaders(token));
}

export function deleteAccount(password, token) {
  return api.delete('/profile', { ...authHeaders(token), data: { password } });
}

export function verifyEmail(token) {
  return api.get(`/verify-email/${token}`);
}

export function resendVerification(token) {
  return api.post('/resend-verification', {}, authHeaders(token));
}

// Day 28: "Download your information" -- the account's data as JSON text
// (kept as text, not parsed: it is saved as a file as-is, and an error's
// plain-text message still reaches serverErrorText).
export async function downloadMyData(token) {
  const res = await api.get('/profile/export', { ...authHeaders(token), responseType: 'text', transformResponse: [(data) => data] });
  return res.data;
}
