import { useEffect, useState } from 'react';

const AUTH_CHANGE_EVENT = 'mysocialapp:auth-change';

function readAuth() {
  const token = localStorage.getItem('token');
  const userId = parseInt(localStorage.getItem('userId'), 10);
  const username = localStorage.getItem('username') || null;
  return { token, userId, username };
}

// Call this right after writing or clearing the token/userId/username keys
// (login, the 401 interceptor in api.js) so every mounted useAuth() consumer
// picks up the change immediately. Plain localStorage writes are otherwise
// silent to React -- components that only re-render on their own state/props
// (e.g. SocketProvider, which sits above the router and doesn't naturally
// re-render on a client-side navigate() after login) would keep seeing the
// pre-login value until something else happened to remount them.
export function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

// Single place that clears a dead session and sends the user back to
// login -- used by both api.js's 401 interceptor and SocketProvider's
// AUTH_FAILED handling, so the two can't drift into slightly different
// "what does logging someone out actually do" behavior.
export function forceLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
  notifyAuthChange();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

// Centralizes the localStorage-based auth read so every component that
// needs the current user's token/id/name doesn't repeat this lookup.
// `username` is only present for sessions that logged in after this field
// was added (Step 5) -- callers should fall back gracefully if it's null.
export function useAuth() {
  const [auth, setAuth] = useState(readAuth);

  useEffect(() => {
    const handleChange = () => setAuth(readAuth());
    window.addEventListener(AUTH_CHANGE_EVENT, handleChange);
    window.addEventListener('storage', handleChange); // cross-tab login/logout
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  return auth;
}
