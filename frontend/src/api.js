import axios from 'axios';
import { notifyAuthChange } from './hooks/useAuth';

// Falls back to localhost for local dev; set VITE_API_URL in the environment
// (frontend/.env, or the hosting platform's env config) to point at the
// deployed backend.
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Centralized "expired authentication" handling: any 401 from an
// authenticated endpoint means the token is dead, so clear it and bounce to
// login rather than letting every mutation hook rediscover that on its own.
// Login/signup 401s (wrong credentials) are excluded -- those are a normal
// form validation error for Login.jsx to show, not a session expiring.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthEndpoint = url.includes('/login') || url.includes('/signup');
    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      notifyAuthChange();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

// Post/avatar images can be either a Cloudinary URL (already absolute) or a
// legacy `/uploads/...` path from before the Cloudinary switch (relative to
// the backend). Passing an absolute URL through API_BASE_URL unchanged keeps
// both working.
export function resolveImageUrl(url) {
  if (!url) return undefined;
  return /^https?:\/\//.test(url) ? url : `${API_BASE_URL}${url}`;
}

export default api;
