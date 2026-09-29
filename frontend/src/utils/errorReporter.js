import { API_BASE_URL } from '../api';

// Day 10: sends browser crashes to the backend's error log (POST
// /client-errors), so errors that only happen on someone's phone show up in
// the admin panel. Production builds only: in local dev the console is
// where you see them.
//
// A page can only send a few (a crash loop mustn't flood the server), the
// same message is sent once, and `keepalive` lets the report finish even
// if the page is being closed or reloaded.
const MAX_REPORTS = 10;
const sent = new Set();

export function reportClientError(kind, error) {
  if (!import.meta.env.PROD) return;
  try {
    const message = String((error && error.message) || error || 'Unknown error').slice(0, 500);
    if (sent.size >= MAX_REPORTS || sent.has(message)) return;
    sent.add(message);
    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/client-errors`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        kind,
        message,
        stack: String((error && error.stack) || '').slice(0, 4000),
        url: window.location.pathname // path only: never the query string
      })
    }).catch(() => {}); // reporting must never cause another error
  } catch {
    // storage blocked, etc. -- nothing more to do
  }
}

// Uncaught errors and unhandled promise rejections anywhere on the page.
export function installGlobalErrorReporting() {
  window.addEventListener('error', (event) => reportClientError('error', event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => reportClientError('unhandledrejection', event.reason));
}
