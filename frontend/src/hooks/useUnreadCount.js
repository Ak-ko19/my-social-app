import { useCallback, useEffect, useState } from 'react';
import { fetchUnreadCount } from '../services/notificationService';

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

  return { unreadCount, reload };
}
