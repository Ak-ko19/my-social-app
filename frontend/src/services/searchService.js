import api from '../api';

// Pass the viewer's token: /search/users is optionalAuth, and without it
// the search runs anonymously (blocked users would still be suggested).
export function searchUsers(query, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return api.get('/search/users', { params: { q: query }, headers }).then((res) => res.data);
}
