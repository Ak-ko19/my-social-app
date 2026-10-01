import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// idOrUsername works for both a numeric user id and a @mention's username
// (see backend profileController.getProfile).
export function fetchProfile(idOrUsername, token) {
  return api.get(`/profile/${idOrUsername}`, token ? authHeaders(token) : undefined).then((res) => res.data);
}

// B6 profile tabs: tab = 'posts' | 'photos' | 'tagged'. A private account
// the viewer doesn't follow answers 403 (see backend userPostsController).
export function fetchUserPosts(userId, tab, token, { page = 1, limit = 12 } = {}) {
  return api
    .get(`/users/${userId}/posts`, { ...(token ? authHeaders(token) : {}), params: { tab, page, limit } })
    .then((res) => res.data);
}

// Day 16: the app language saved on the account (follows you to every
// device). language = 'en' | 'my' | 'ar'.
export function saveLanguage(language, token) {
  return api.put('/profile/language', { language }, authHeaders(token)).then((res) => res.data);
}
