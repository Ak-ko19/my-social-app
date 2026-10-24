import { useEffect } from 'react';

// Day 80: a load that failed while offline runs again by itself as soon as
// the connection is back (like Facebook's and Instagram's lists).
export function useRetryWhenOnline(online, onRetry) {
  useEffect(() => {
    if (online || !onRetry) return undefined;
    const retry = () => onRetry();
    window.addEventListener('online', retry, { once: true });
    return () => window.removeEventListener('online', retry);
  }, [online, onRetry]);
}
