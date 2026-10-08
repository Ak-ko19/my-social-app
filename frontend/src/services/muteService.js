import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 47: mute a person -- their posts and stories leave your Home,
// stories and Explore. They are never told.
export function muteUser(userId, token) {
  return api.post(`/users/${userId}/mute`, {}, authHeaders(token)).then((res) => res.data);
}

export function unmuteUser(userId, token) {
  return api.delete(`/users/${userId}/mute`, authHeaders(token)).then((res) => res.data);
}

export function fetchMutedUsers(token, { page = 1, limit = 50 } = {}) {
  return api.get('/muted-users', { ...authHeaders(token), params: { page, limit } }).then((res) => res.data);
}
