import { useEffect, useState } from 'react';
import api from '../api';

// GET /config is fetched once per page load and shared by every caller. A
// failed request isn't cached, so the next screen that asks retries.
let configPromise = null;
export function loadConfig() {
  if (!configPromise) {
    configPromise = api
      .get('/config')
      .then((res) => res.data)
      .catch(() => {
        configPromise = null;
        return null;
      });
  }
  return configPromise;
}

// Whether the server can send emails right now (see backend GET /config):
// null while unknown, then true/false. If the server can't be asked it
// stays true, i.e. the behaviour from before this existed.
export function useEmailEnabled() {
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    let active = true;
    loadConfig().then((config) => {
      if (active) setEnabled(config ? config.emailEnabled !== false : true);
    });
    return () => {
      active = false;
    };
  }, []);
  return enabled;
}
