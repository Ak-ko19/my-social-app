import { useCallback, useEffect, useState } from 'react';
import { fetchUnreadCount } from '../services/notificationService';
import { useSocketEvent } from './useSocketEvent';

export function useUnreadCount(token) {
  const [unreadCount, setUnreadCount] = useState(0);

  const reload = useCallback(() => {
    if (!token) return;
    fetchUnreadCount(token)
      .then(setUnreadCount)
      .catch((err) => console.error(err));
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Day 81: the badge follows new and read notifications as they happen.
  const follow = useCallback((payload) => {
    if (Number.isInteger(payload?.unreadCount)) setUnreadCount(payload.unreadCount);
  }, []);
  useSocketEvent('notification_new', follow);
  useSocketEvent('notifications_read', follow);

  return { unreadCount, reload };
}
