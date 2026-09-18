import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function fetchFeed(token, { page = 1, limit = 20 } = {}) {
  return api
    .get('/feed', { ...authHeaders(token), params: { page, limit } })
    .then((res) => res.data);
}

export function likePost(postId, token) {
  return api.post(`/posts/${postId}/like`, {}, authHeaders(token)).then((res) => res.data);
}

export function unlikePost(postId, token) {
  return api.delete(`/posts/${postId}/like`, authHeaders(token)).then((res) => res.data);
}

export function followUser(userId, token) {
  return api.post(`/users/${userId}/follow`, {}, authHeaders(token));
}

export function unfollowUser(userId, token) {
  return api.delete(`/users/${userId}/follow`, authHeaders(token));
}

export function fetchComments(postId) {
  return api.get(`/posts/${postId}/comments`).then((res) => res.data);
}

export function createComment(postId, content, token) {
  return api.post(`/posts/${postId}/comments`, { content }, authHeaders(token)).then((res) => res.data);
}

export function updateComment(commentId, content, token) {
  return api.put(`/comments/${commentId}`, { content }, authHeaders(token)).then((res) => res.data);
}

export function deletePost(postId, token) {
  return api.delete(`/posts/${postId}`, authHeaders(token));
}
