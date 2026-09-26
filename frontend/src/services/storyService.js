import api from '../api';

// B3 Stories -- see backend/controllers/storiesController.js.
function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// [{ user_id, username, avatar_url, is_own, all_seen, stories: [{ id, media_url, created_at, expires_at, seen }] }]
export function fetchStoriesTray(token) {
  return api.get('/stories', authHeaders(token)).then((res) => res.data);
}

export function createStory(file, token) {
  const formData = new FormData();
  formData.append('image', file);
  return api.post('/stories', formData, authHeaders(token)).then((res) => res.data);
}

export function markStoryViewed(storyId, token) {
  return api.post(`/stories/${storyId}/view`, {}, authHeaders(token));
}

export function deleteStory(storyId, token) {
  return api.delete(`/stories/${storyId}`, authHeaders(token));
}
