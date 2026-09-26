import api from '../api';

// B7 Explore -- optionalAuth endpoints: send the token when there is one so
// follows' posts are included and blocked authors filtered out.
const withAuth = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});

// [{ tag, post_count }]
export function fetchTrendingHashtags(token) {
  return api.get('/explore/hashtags', withAuth(token)).then((res) => res.data);
}

// { posts, hasMore, currentPage }
export function fetchPopularPosts(token, { page = 1, limit = 10 } = {}) {
  return api.get('/explore/posts', { ...withAuth(token), params: { page, limit } }).then((res) => res.data);
}
