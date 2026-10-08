import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 47: your close friends list -- they see your "Close friends" posts
// and stories. You can add people who follow you.
export function fetchCloseFriends(token) {
  return api.get('/close-friends', { ...authHeaders(token), params: { limit: 100 } }).then((res) => res.data);
}

export function fetchCloseFriendCandidates(token, q = '') {
  return api.get('/close-friends/candidates', { ...authHeaders(token), params: { q, limit: 50 } }).then((res) => res.data);
}

export function addCloseFriend(userId, token) {
  return api.put(`/close-friends/${userId}`, {}, authHeaders(token)).then((res) => res.data);
}

export function removeCloseFriend(userId, token) {
  return api.delete(`/close-friends/${userId}`, authHeaders(token)).then((res) => res.data);
}
