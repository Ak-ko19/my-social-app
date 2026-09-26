import api from '../api';

// B8 -- see backend/controllers/suggestionsController.js.
// [{ id, username, avatar_url, bio, is_private, reason: 'mutuals'|'follows_you'|'popular',
//    mutual_count, mutual_sample, follows_you, follower_count? }]
export function fetchSuggestions(token) {
  return api.get('/users/suggestions', { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.data);
}
