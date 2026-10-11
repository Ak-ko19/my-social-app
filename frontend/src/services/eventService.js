import api from '../api';

// Day 55: events -- backend controllers/eventController.js. An event is
// { id, name, description, starts_at, ends_at, location, audience,
// cancelled_at, has_ended, host_id, host_username, host_avatar_url,
// going_count, interested_count, my_response, is_host }.
const withAuth = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});
const data = (res) => res.data;

// section: 'mine' (hosting or answered) | 'discover' -> { events, page, hasMore }
export const fetchEvents = (section, token, { page = 1, limit = 20 } = {}) =>
  api.get('/events', { ...withAuth(token), params: { section, page, limit } }).then(data);
export const fetchEvent = (id, token) => api.get(`/events/${id}`, withAuth(token)).then(data);
// fields: { name, startsAt, endsAt, location, description, audience }
export const createEvent = (fields, token) => api.post('/events', fields, withAuth(token)).then(data);
export const updateEvent = (id, fields, token) => api.patch(`/events/${id}`, fields, withAuth(token)).then(data);
export const cancelEvent = (id, token) => api.post(`/events/${id}/cancel`, {}, withAuth(token)).then(data);
export const deleteEvent = (id, token) => api.delete(`/events/${id}`, withAuth(token)).then(data);
// status: 'going' | 'interested'; each answers with the event.
export const respondToEvent = (id, status, token) => api.put(`/events/${id}/response`, { status }, withAuth(token)).then(data);
export const removeEventResponse = (id, token) => api.delete(`/events/${id}/response`, withAuth(token)).then(data);
// -> { guests, page, hasMore }
export const fetchEventGuests = (id, status, token, { page = 1, limit = 20 } = {}) =>
  api.get(`/events/${id}/guests`, { ...withAuth(token), params: { status, page, limit } }).then(data);
