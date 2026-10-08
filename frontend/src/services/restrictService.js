import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 47: restrict a person -- their new comments on your posts wait for
// your approval, and they can't notify you. They are never told.
export function restrictUser(userId, token) {
  return api.post(`/users/${userId}/restrict`, {}, authHeaders(token)).then((res) => res.data);
}

export function unrestrictUser(userId, token) {
  return api.delete(`/users/${userId}/restrict`, authHeaders(token)).then((res) => res.data);
}

export function fetchRestrictedUsers(token, { page = 1, limit = 50 } = {}) {
  return api.get('/restricted-users', { ...authHeaders(token), params: { page, limit } }).then((res) => res.data);
}
