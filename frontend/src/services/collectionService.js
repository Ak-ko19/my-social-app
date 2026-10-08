import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 46: saved collections (backend routes/collectionRoutes.js).
// A collection: { id, name, post_count, cover_url, created_at, updated_at }.

export function fetchCollections(token) {
  return api.get('/collections', authHeaders(token)).then((res) => res.data);
}

export function createCollection(name, token) {
  return api.post('/collections', { name }, authHeaders(token)).then((res) => res.data);
}

export function renameCollection(id, name, token) {
  return api.patch(`/collections/${id}`, { name }, authHeaders(token)).then((res) => res.data);
}

export function deleteCollection(id, token) {
  return api.delete(`/collections/${id}`, authHeaders(token)).then((res) => res.data);
}

// { page, collection: { id, name }, posts, hasMore }
export function fetchCollectionPosts(id, token, { page = 1, limit = 10 } = {}) {
  return api.get(`/collections/${id}/posts`, { ...authHeaders(token), params: { page, limit } }).then((res) => res.data);
}

// The ids of your collections a post is in.
export function fetchPostCollections(postId, token) {
  return api.get(`/posts/${postId}/collections`, authHeaders(token)).then((res) => res.data.collectionIds);
}

// Puts the post in exactly these collections (saving it if it wasn't).
export function setPostCollections(postId, collectionIds, token) {
  return api.put(`/posts/${postId}/collections`, { collectionIds }, authHeaders(token)).then((res) => res.data);
}

// Matches the backend (services/collectionService.js).
export const MAX_COLLECTION_NAME = 50;
