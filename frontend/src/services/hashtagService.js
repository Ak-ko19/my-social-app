import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// sort: 'top' (ranked by engagement, Day 40) or 'recent' (newest first).
export function fetchPostsByHashtag(tag, token, { page = 1, limit = 10, sort = 'recent' } = {}) {
  const config = { params: { page, limit, sort }, ...(token ? authHeaders(token) : {}) };
  return api.get(`/hashtags/${encodeURIComponent(tag)}/posts`, config).then((res) => res.data);
}

// Days 107-108: following a hashtag -- its public posts come to Home.
// { tag, is_following } (is_following false when logged out).
export function fetchHashtag(tag, token) {
  return api.get(`/hashtags/${encodeURIComponent(tag)}`, token ? authHeaders(token) : {}).then((res) => res.data);
}
export function followHashtag(tag, token) {
  return api.put(`/hashtags/${encodeURIComponent(tag)}/follow`, {}, authHeaders(token)).then((res) => res.data);
}
export function unfollowHashtag(tag, token) {
  return api.delete(`/hashtags/${encodeURIComponent(tag)}/follow`, authHeaders(token)).then((res) => res.data);
}
// { hashtags: [{ tag, followed_at }], max }
export function fetchFollowedHashtags(token) {
  return api.get('/followed-hashtags', authHeaders(token)).then((res) => res.data);
}
