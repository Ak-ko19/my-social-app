import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function blockUser(userId, token) {
  return api.post(`/users/${userId}/block`, {}, authHeaders(token));
}

export function unblockUser(userId, token) {
  return api.delete(`/users/${userId}/block`, authHeaders(token));
}

export function fetchBlockedUsers(token, { page = 1, limit = 20 } = {}) {
  return api
    .get('/blocked-users', { ...authHeaders(token), params: { page, limit } })
    .then((res) => res.data);
}
