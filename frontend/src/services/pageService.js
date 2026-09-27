import api from '../api';

// B14 Pages -- see backend/controllers/pageController.js.
const withAuth = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});
const data = (res) => res.data;

export const PAGE_CATEGORIES = [
  { value: 'business', label: 'Business' },
  { value: 'creator', label: 'Creator' },
  { value: 'brand', label: 'Brand' },
  { value: 'organization', label: 'Organization' },
  { value: 'community', label: 'Community' },
  { value: 'other', label: 'Other' }
];
export const categoryLabel = (value) => PAGE_CATEGORIES.find((c) => c.value === value)?.label || value;

// { owned, following, discover } -- each { id, name, category, description, follower_count, is_following, is_owner, owner_id, owner_username }
export const fetchPages = (token, q = '') => api.get('/pages', { ...withAuth(token), params: q ? { q } : {} }).then(data);
export const createPage = (fields, token) => api.post('/pages', fields, withAuth(token)).then(data);
export const fetchPage = (id, token) => api.get(`/pages/${id}`, withAuth(token)).then(data);
export const updatePage = (id, fields, token) => api.patch(`/pages/${id}`, fields, withAuth(token)).then(data);
export const deletePage = (id, token) => api.delete(`/pages/${id}`, withAuth(token)).then(data);
export const followPage = (id, token) => api.post(`/pages/${id}/follow`, {}, withAuth(token)).then(data);
export const unfollowPage = (id, token) => api.delete(`/pages/${id}/follow`, withAuth(token)).then(data);
export const fetchPagePosts = (id, token, { page = 1, limit = 10 } = {}) =>
  api.get(`/pages/${id}/posts`, { ...withAuth(token), params: { page, limit } }).then(data);
