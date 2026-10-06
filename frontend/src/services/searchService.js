import api from '../api';

const withAuth = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

// Pass the viewer's token: /search/users is optionalAuth, and without it
// the search runs anonymously (blocked users would still be suggested).
export function searchUsers(query, token) {
  return api.get('/search/users', { params: { q: query }, headers: withAuth(token) }).then((res) => res.data);
}

// Ranked posts, a page at a time: { posts, hasMore }.
export function searchPosts(query, token, page = 1) {
  return api.get('/search/posts', { params: { q: query, page }, headers: withAuth(token) }).then((res) => res.data);
}

// Tags with their public post counts: [{ tag, post_count, capped }].
export function searchHashtags(query, token) {
  return api.get('/search/hashtags', { params: { q: query }, headers: withAuth(token) }).then((res) => res.data);
}
