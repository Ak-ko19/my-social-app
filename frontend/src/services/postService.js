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

// Set or change the viewer's reaction (B1). Removing one is unlikePost.
export function setReaction(postId, reaction, token) {
  return api.put(`/posts/${postId}/reaction`, { reaction }, authHeaders(token)).then((res) => res.data);
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

// Token required for a private account's post: GET comments applies the
// same visibility rules as GET /posts/:id, so an anonymous request 404s.
export function fetchComments(postId, token) {
  return api.get(`/posts/${postId}/comments`, token ? authHeaders(token) : undefined).then((res) => res.data);
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

export function updatePost(postId, content, token) {
  return api.put(`/posts/${postId}`, { content }, authHeaders(token)).then((res) => res.data);
}

// Public endpoint (optionalAuth on the backend) -- works for a logged-out
// viewer following a shared link, not just an authenticated in-app user.
// Passing no token omits the Authorization header entirely rather than
// sending "Bearer undefined".
export function fetchPost(postId, token) {
  return api.get(`/posts/${postId}`, token ? authHeaders(token) : undefined).then((res) => res.data);
}

export function fetchFollowCounts(userId) {
  return api.get(`/users/${userId}/follow-counts`).then((res) => res.data);
}

export function fetchFollowRequests(token) {
  return api.get('/follow-requests', authHeaders(token)).then((res) => res.data);
}

export function approveFollowRequest(followerId, token) {
  return api.post(`/follow-requests/${followerId}/approve`, {}, authHeaders(token));
}

export function denyFollowRequest(followerId, token) {
  return api.delete(`/follow-requests/${followerId}`, authHeaders(token));
}
