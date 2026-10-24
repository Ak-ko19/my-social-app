import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import api from '../api';
import SocketContext from '../context/SocketContext';
import { useUnreadCount } from './useUnreadCount';

vi.mock('../api', () => ({ default: { get: vi.fn() } }));

// Day 81: the notifications badge follows the server as things happen.
describe('useUnreadCount', () => {
  it('loads the count, then follows new and read notifications live', async () => {
    api.get.mockResolvedValue({ data: { unreadCount: 3 } });
    const handlers = {};
    const socket = { on: (event, fn) => { handlers[event] = fn; }, off: vi.fn() };
    const wrapper = ({ children }) => <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
    const { result, unmount } = renderHook(() => useUnreadCount('tok'), { wrapper });
    await waitFor(() => expect(result.current.unreadCount).toBe(3));
    await act(async () => handlers.notification_new({ unreadCount: 4 }));
    expect(result.current.unreadCount).toBe(4);
    await act(async () => handlers.notifications_read({ unreadCount: 0 }));
    expect(result.current.unreadCount).toBe(0);
    // Anything that isn't a count is ignored.
    await act(async () => handlers.notification_new({}));
    expect(result.current.unreadCount).toBe(0);
    unmount();
    expect(socket.off).toHaveBeenCalledTimes(2);
  });

  it('without a socket (logged out, tests) it still loads the count', async () => {
    api.get.mockResolvedValue({ data: { unreadCount: 1 } });
    const { result } = renderHook(() => useUnreadCount('tok'));
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
  });
});
