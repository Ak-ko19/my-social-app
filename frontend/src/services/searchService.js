import api from '../api';

export function searchUsers(query) {
  return api.get('/search/users', { params: { q: query } }).then((res) => res.data);
}
