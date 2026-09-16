import axios from 'axios';

// Falls back to localhost for local dev; set VITE_API_URL in the environment
// (frontend/.env, or the hosting platform's env config) to point at the
// deployed backend.
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export default api;
