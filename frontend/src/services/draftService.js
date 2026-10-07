import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 45: drafts and scheduled posts (backend routes/draftRoutes.js).
// A draft: { id, content, visibility, community_id, community_name, page_id,
// page_name, poll: { options, durationHours } | null, media: [{ url }],
// scheduled_for, last_error, created_at, updated_at }.

export function fetchDrafts(token) {
  return api.get('/drafts', authHeaders(token)).then((res) => res.data);
}

export function fetchDraft(id, token) {
  return api.get(`/drafts/${id}`, authHeaders(token)).then((res) => res.data);
}

// formData: the composer's fields (+ scheduledFor, keepMedia when editing).
export function saveDraft(formData, token, id = null) {
  const request = id ? api.put(`/drafts/${id}`, formData, authHeaders(token)) : api.post('/drafts', formData, authHeaders(token));
  return request.then((res) => res.data);
}

// scheduledFor: an ISO time, or null to make it a plain draft again.
export function scheduleDraft(id, scheduledFor, token) {
  return api.put(`/drafts/${id}/schedule`, { scheduledFor }, authHeaders(token)).then((res) => res.data);
}

export function publishDraft(id, token) {
  return api.post(`/drafts/${id}/publish`, null, authHeaders(token)).then((res) => res.data);
}

export function deleteDraft(id, token) {
  return api.delete(`/drafts/${id}`, authHeaders(token)).then((res) => res.data);
}

// <input type="datetime-local"> works in local time without a zone:
// "2026-10-07T15:15". These convert to and from it.
const pad = (n) => String(n).padStart(2, '0');
export function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInputValue(value) {
  const d = new Date(value); // a zone-less date-time is read as local time
  return Number.isNaN(d.getTime()) ? null : d;
}

// The backend's range (services/draftService.js): 5 minutes to 30 days.
export const MIN_SCHEDULE_MINUTES = 5;
export const MAX_SCHEDULE_DAYS = 30;
export function scheduleProblem(date, now = new Date()) {
  if (!date) return 'drafts.scheduleInvalid';
  if (date.getTime() < now.getTime() + MIN_SCHEDULE_MINUTES * 60 * 1000) return 'drafts.scheduleTooSoon';
  if (date.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) return 'drafts.scheduleTooLate';
  return null;
}
