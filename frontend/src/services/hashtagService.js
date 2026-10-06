import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// sort: 'top' (ranked by engagement, Day 40) or 'recent' (newest first).
export function fetchPostsByHashtag(tag, token, { page = 1, limit = 10, sort = 'recent' } = {}) {
  const config = { params: { page, limit, sort }, ...(token ? authHeaders(token) : {}) };
  return api.get(`/hashtags/${encodeURIComponent(tag)}/posts`, config).then((res) => res.data);
}
