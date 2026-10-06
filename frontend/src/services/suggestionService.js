import api from '../api';

// B8 -- see backend/controllers/suggestionsController.js.
// [{ id, username, avatar_url, bio, is_private, reason: 'mutuals'|'follows_you'|'popular',
//    mutual_count, mutual_sample, follows_you, follower_count? }]
// Day 39: hide someone from your suggestions (204).
export function dismissSuggestion(userId, token) {
  return api.post(`/users/suggestions/${userId}/dismiss`, {}, { headers: { Authorization: `Bearer ${token}` } });
}

export function fetchSuggestions(token) {
  return api.get('/users/suggestions', { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.data);
}
