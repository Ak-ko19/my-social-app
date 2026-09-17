import axios from 'axios';

// Falls back to localhost for local dev; set VITE_API_URL in the environment
// (frontend/.env, or the hosting platform's env config) to point at the
// deployed backend.
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Post/avatar images can be either a Cloudinary URL (already absolute) or a
// legacy `/uploads/...` path from before the Cloudinary switch (relative to
// the backend). Passing an absolute URL through API_BASE_URL unchanged keeps
// both working.
export function resolveImageUrl(url) {
  if (!url) return undefined;
  return /^https?:\/\//.test(url) ? url : `${API_BASE_URL}${url}`;
}

export default api;
