import { useEffect, useState } from 'react';

// Day 72: whether the browser says it has a network connection, kept up to
// date by its online/offline events. (navigator.onLine can say "online" on
// a network that reaches nothing; the screens still handle failed requests.)
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
