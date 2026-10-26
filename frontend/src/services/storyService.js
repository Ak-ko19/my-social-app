import api from '../api';
import { compressImage } from '../utils/compressImage';

// B3 Stories -- see backend/controllers/storiesController.js.
function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// [{ user_id, username, avatar_url, is_own, can_reply, all_seen, stories: [{ id, media_url, created_at, expires_at, seen }] }]
export function fetchStoriesTray(token) {
  return api.get('/stories', authHeaders(token)).then((res) => res.data);
}

// Day 47: closeFriends -- for the people on your close friends list only.
// Day 57: shrunk first (utils/compressImage).
export async function createStory(file, token, { closeFriends = false } = {}) {
  const formData = new FormData();
  formData.append('image', await compressImage(file));
  if (closeFriends) formData.append('closeFriends', 'true');
  return api.post('/stories', formData, authHeaders(token)).then((res) => res.data);
}

export function markStoryViewed(storyId, token) {
  return api.post(`/stories/${storyId}/view`, {}, authHeaders(token));
}

export function deleteStory(storyId, token) {
  return api.delete(`/stories/${storyId}`, authHeaders(token));
}

// Day 100: a reply or a quick reaction, sent to the author as a message.
// Resolves to { conversationId, message }.
export function replyToStory(storyId, text, token) {
  return api.post(`/stories/${storyId}/reply`, { text }, authHeaders(token)).then((res) => res.data);
}

export function reactToStory(storyId, emoji, token) {
  return api.post(`/stories/${storyId}/react`, { emoji }, authHeaders(token)).then((res) => res.data);
}
