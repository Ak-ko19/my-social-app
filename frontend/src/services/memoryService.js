import api from '../api';

// The device's own time zone, so "today" is the person's today.
export function myTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Days 83-84: your posts from this day in earlier years (backend
// memoryController). -> { date, memories: [{ yearsAgo, year, posts }] }
export function fetchMemories(token) {
  return api.get('/memories', { headers: { Authorization: `Bearer ${token}` }, params: { tz: myTimeZone() } }).then((res) => res.data);
}
