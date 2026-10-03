import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from './useAuth';

// Day 19: the preview of one link (backend GET /link-preview), shared by
// every post/message showing the same link: one request per URL per page
// load. null = nothing to show (loading, logged out, no preview, error).
const cache = new Map(); // url -> Promise<preview | null>

function loadPreview(url, token) {
  if (!cache.has(url)) {
    const pending = api
      .get('/link-preview', { params: { url }, headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.status === 200 && res.data?.title ? res.data : null))
      .catch(() => {
        cache.delete(url); // a network blip: try again next time
        return null;
      });
    cache.set(url, pending);
  }
  return cache.get(url);
}

export function useLinkPreview(url) {
  const { token } = useAuth();
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!url || !token) return undefined;
    let active = true;
    loadPreview(url, token).then((result) => {
      if (active) setPreview(result);
    });
    return () => {
      active = false;
    };
  }, [url, token]);

  return url && token ? preview : null;
}

// Tests only.
export function clearLinkPreviewCache() {
  cache.clear();
}
