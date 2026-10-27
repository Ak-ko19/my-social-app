import api from '../api';
import { compressImage } from '../utils/compressImage';

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
// device). language = 'en' | 'ar'.
export function saveLanguage(language, token) {
  return api.put('/profile/language', { language }, authHeaders(token)).then((res) => res.data);
}

// Day 36: cover photo (saved at once, not with the Edit Profile form).
// Both resolve to { cover_url }.
// Day 57: shrunk first (utils/compressImage).
export async function setCoverPhoto(file, token) {
  const form = new FormData();
  form.append('cover', await compressImage(file));
  return api.put('/profile/cover', form, authHeaders(token)).then((res) => res.data);
}

// Day 78: the profile photo alone (the first-run steps) -> { avatar_url }.
export async function setProfilePhoto(file, token) {
  const form = new FormData();
  form.append('avatar', await compressImage(file));
  return api.put('/profile/avatar', form, authHeaders(token)).then((res) => res.data);
}

// Day 78: the first-run steps are finished or skipped -> { onboarded_at }.
export function finishOnboarding(token) {
  return api.post('/profile/onboarding/done', {}, authHeaders(token)).then((res) => res.data);
}

// Day 105: "Don't show again" on the Finish-your-profile card.
export function dismissProfileCard(token) {
  return api.post('/profile/completion/dismiss', {}, authHeaders(token)).then((res) => res.data);
}

export function removeCoverPhoto(token) {
  return api.delete('/profile/cover', authHeaders(token)).then((res) => res.data);
}

// Day 36: pin one of your posts to the top of your profile / unpin it.
export function pinPost(postId, token) {
  return api.put('/profile/pinned-post', { postId }, authHeaders(token)).then((res) => res.data);
}

export function unpinPost(token) {
  return api.delete('/profile/pinned-post', authHeaders(token)).then((res) => res.data);
}

// Day 37: one page of a person's friends (mutual follows), followers or
// following -- { users, page, hasMore }, each user with is_following /
// request_pending / follows_you for the viewer.
export function fetchConnections(userId, type, token, { page = 1, limit = 30 } = {}) {
  return api
    .get(`/users/${userId}/connections`, { ...(token ? authHeaders(token) : {}), params: { type, page, limit } })
    .then((res) => res.data);
}

// Day 37: { count, sample } -- the viewer's friends who are this person's too.
export function fetchMutualFriends(userId, token) {
  return api.get(`/users/${userId}/mutual-friends`, token ? authHeaders(token) : undefined).then((res) => res.data);
}
