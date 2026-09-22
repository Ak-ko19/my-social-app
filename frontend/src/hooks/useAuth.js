import { useEffect, useState } from 'react';

const AUTH_CHANGE_EVENT = 'mysocialapp:auth-change';

function readAuth() {
  const token = localStorage.getItem('token');
  const userId = parseInt(localStorage.getItem('userId'), 10);
  const username = localStorage.getItem('username') || null;
  // 'true'/'false' string (localStorage only stores strings) -- absent for
  // sessions that logged in before this field was added, same fallback
  // pattern `username` already documents below.
  const emailVerifiedRaw = localStorage.getItem('emailVerified');
  const emailVerified = emailVerifiedRaw === null ? null : emailVerifiedRaw === 'true';
  return { token, userId, username, emailVerified };
}

// Called after login/signup writes emailVerified, and whenever the app
// learns the real value some other way (e.g. GET /profile/me), so every
// mounted useAuth() consumer picks it up without needing a full page
// reload -- same notifyAuthChange mechanism as token/userId/username.
export function setEmailVerified(value) {
  localStorage.setItem('emailVerified', String(value));
  notifyAuthChange();
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
  localStorage.removeItem('emailVerified');
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
