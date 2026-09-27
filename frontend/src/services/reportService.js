import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Labels are i18n keys: report.reasons.<value>.
export const REPORT_REASONS = [
  { value: 'spam' },
  { value: 'harassment' },
  { value: 'inappropriate_content' },
  { value: 'hate_speech' },
  { value: 'misinformation' },
  { value: 'other' }
];

export function submitReport({ targetType, targetId, reason, details }, token) {
  return api.post('/reports', { targetType, targetId, reason, details }, authHeaders(token)).then((res) => res.data);
}
