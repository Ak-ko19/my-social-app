import api from '../api';
import i18n from '../i18n';

// B14 Pages -- see backend/controllers/pageController.js.
const withAuth = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});
const data = (res) => res.data;

// Keep in sync with the backend's CATEGORIES. Labels: pages.categories.<value>.
export const PAGE_CATEGORIES = ['business', 'creator', 'brand', 'organization', 'community', 'other'];
export const categoryLabel = (value) => i18n.t(`pages.categories.${value}`, { defaultValue: value });

// { owned, ownedHasMore, following, followingHasMore, discover, discoverHasMore }
// -- each page { id, name, category, description, follower_count,
// is_following, is_owner, is_admin, owner_id, owner_username }; "owned" is
// the pages you run (Day 53: as owner or admin). With a section, more of
// it: { pages, page, hasMore }.
export const fetchPages = (token, q = '', { section, page } = {}) =>
  api.get('/pages', { ...withAuth(token), params: { ...(q ? { q } : {}), ...(section ? { section, page } : {}) } }).then(data);
export const createPage = (fields, token) => api.post('/pages', fields, withAuth(token)).then(data);
export const fetchPage = (id, token) => api.get(`/pages/${id}`, withAuth(token)).then(data);
export const updatePage = (id, fields, token) => api.patch(`/pages/${id}`, fields, withAuth(token)).then(data);
export const deletePage = (id, token) => api.delete(`/pages/${id}`, withAuth(token)).then(data);
export const followPage = (id, token) => api.post(`/pages/${id}/follow`, {}, withAuth(token)).then(data);
export const unfollowPage = (id, token) => api.delete(`/pages/${id}/follow`, withAuth(token)).then(data);
// Day 101: which of the page's new posts you hear about -- 'all' | 'highlights' | 'off'.
export const setPagePostNotifications = (id, level, token) => api.put(`/pages/${id}/notifications`, { level }, withAuth(token)).then(data);
export const fetchPagePosts = (id, token, { page = 1, limit = 10 } = {}) =>
  api.get(`/pages/${id}/posts`, { ...withAuth(token), params: { page, limit } }).then(data);
// Day 53: page admins -- { owner, admins }; the owner adds / removes, an
// admin may remove themselves (leave).
export const fetchPageAdmins = (id, token) => api.get(`/pages/${id}/admins`, withAuth(token)).then(data);
export const addPageAdmin = (id, username, token) => api.post(`/pages/${id}/admins`, { username }, withAuth(token)).then(data);
export const removePageAdmin = (id, userId, token) => api.delete(`/pages/${id}/admins/${userId}`, withAuth(token)).then(data);
// Day 106: asking for the blue tick (owner and admins) -- each answers the
// page's verification state { verified_at, request, removed, can_request,
// why_not, next_request_at }.
export const fetchPageVerification = (id, token) => api.get(`/pages/${id}/verification`, withAuth(token)).then(data);
export const requestPageVerification = (id, fields, token) => api.post(`/pages/${id}/verification`, fields, withAuth(token)).then(data);
export const withdrawPageVerification = (id, token) => api.delete(`/pages/${id}/verification`, withAuth(token)).then(data);
