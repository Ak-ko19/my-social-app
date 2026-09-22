import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function fetchPostsByHashtag(tag, token, { page = 1, limit = 10 } = {}) {
  const config = { params: { page, limit }, ...(token ? authHeaders(token) : {}) };
  return api.get(`/hashtags/${encodeURIComponent(tag)}/posts`, config).then((res) => res.data);
}
