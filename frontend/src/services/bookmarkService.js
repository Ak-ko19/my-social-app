import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function bookmarkPost(postId, token) {
  return api.post(`/posts/${postId}/bookmark`, {}, authHeaders(token));
}

export function unbookmarkPost(postId, token) {
  return api.delete(`/posts/${postId}/bookmark`, authHeaders(token));
}

export function fetchBookmarks(token, { page = 1, limit = 10 } = {}) {
  return api
    .get('/bookmarks', { ...authHeaders(token), params: { page, limit } })
    .then((res) => res.data);
}
