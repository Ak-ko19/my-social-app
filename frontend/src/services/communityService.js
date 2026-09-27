import api from '../api';

// B13 Groups -- see backend/controllers/communityController.js.
const withAuth = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});
const data = (res) => res.data;

// { mine: [...], discover: [...] } -- each { id, name, description, privacy, member_count, my_role, my_status }
export const fetchCommunities = (token, q = '') => api.get('/communities', { ...withAuth(token), params: q ? { q } : {} }).then(data);
export const createCommunity = (fields, token) => api.post('/communities', fields, withAuth(token)).then(data);
// { ..., member_count, my_role, my_status, is_member, is_admin, can_read }
export const fetchCommunity = (id, token) => api.get(`/communities/${id}`, withAuth(token)).then(data);
export const updateCommunity = (id, fields, token) => api.patch(`/communities/${id}`, fields, withAuth(token)).then(data);
export const joinCommunity = (id, token) => api.post(`/communities/${id}/join`, {}, withAuth(token)).then(data);
// Removing yourself = leaving (or cancelling a pending request).
export const removeCommunityMember = (id, userId, token) => api.delete(`/communities/${id}/members/${userId}`, withAuth(token)).then(data);
export const fetchCommunityPosts = (id, token, { page = 1, limit = 10 } = {}) =>
  api.get(`/communities/${id}/posts`, { ...withAuth(token), params: { page, limit } }).then(data);
export const fetchCommunityMembers = (id, token) => api.get(`/communities/${id}/members`, withAuth(token)).then(data);
export const setCommunityRole = (id, userId, role, token) => api.put(`/communities/${id}/members/${userId}/role`, { role }, withAuth(token)).then(data);
export const fetchJoinRequests = (id, token) => api.get(`/communities/${id}/requests`, withAuth(token)).then(data);
export const approveJoinRequest = (id, userId, token) => api.post(`/communities/${id}/requests/${userId}/approve`, {}, withAuth(token)).then(data);
