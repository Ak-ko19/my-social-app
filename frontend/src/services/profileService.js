import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// idOrUsername works for both a numeric user id and a @mention's username
// (see backend profileController.getProfile).
export function fetchProfile(idOrUsername, token) {
  return api.get(`/profile/${idOrUsername}`, token ? authHeaders(token) : undefined).then((res) => res.data);
}
