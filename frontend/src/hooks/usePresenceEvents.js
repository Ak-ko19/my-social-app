import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';

// Tracks live user_online/user_offline deltas for this session. Has no
// baseline of its own -- each caller already has its own "is this user
// online" starting point from whatever REST data it fetched (is_online on
// a GET /conversations row), and combines that baseline with this hook's
// live overlay via isOnline(userId, baseline): a live event always wins
// over a possibly-stale baseline.
export function usePresenceEvents() {
  const { socket } = useSocket();
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [offlineUserIds, setOfflineUserIds] = useState(() => new Set());

  useEffect(() => {
    if (!socket) return;

    const handleOnline = ({ userId }) => {
      setOnlineUserIds((current) => (current.has(userId) ? current : new Set(current).add(userId)));
      setOfflineUserIds((current) => {
        if (!current.has(userId)) return current;
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    };

    const handleOffline = ({ userId }) => {
      setOfflineUserIds((current) => (current.has(userId) ? current : new Set(current).add(userId)));
      setOnlineUserIds((current) => {
        if (!current.has(userId)) return current;
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    };

    socket.on('user_online', handleOnline);
    socket.on('user_offline', handleOffline);
    return () => {
      socket.off('user_online', handleOnline);
      socket.off('user_offline', handleOffline);
    };
  }, [socket]);

  const isOnline = (userId, baseline) => {
    if (offlineUserIds.has(userId)) return false;
    if (onlineUserIds.has(userId)) return true;
    return Boolean(baseline);
  };

  return { isOnline };
}
