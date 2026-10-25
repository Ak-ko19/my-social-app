import { useEffect } from 'react';
import api from '../../api';
import { useAuth } from '../../hooks/useAuth';
import { myTimeZone } from '../../services/memoryService';

const REPORTED_KEY = 'timeZoneReported'; // "<userId>:<zone>" -- cleared on logout (useAuth)

// Day 84: tells the server this device's time zone (once per account and
// zone), so the memories notification comes in the person's own morning.
// Best effort: nothing on screen depends on it.
function TimeZoneReporter() {
  const { token, userId } = useAuth();
  useEffect(() => {
    if (!token || !userId) return;
    const zone = myTimeZone();
    const key = `${userId}:${zone}`;
    let reported = null;
    try {
      reported = localStorage.getItem(REPORTED_KEY);
    } catch {
      // Storage blocked: report every time instead.
    }
    if (reported === key) return;
    api.put('/profile/time-zone', { timeZone: zone }, { headers: { Authorization: `Bearer ${token}` } })
      .then(() => {
        try {
          localStorage.setItem(REPORTED_KEY, key);
        } catch {
          // As above.
        }
      })
      .catch(() => {});
  }, [token, userId]);
  return null;
}

export default TimeZoneReporter;
