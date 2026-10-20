import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useConversations } from './useConversations';
import { fetchConversations } from '../services/messageService';

vi.mock('../services/messageService', () => ({ fetchConversations: vi.fn() }));
vi.mock('./useSocket', () => ({ useSocket: () => ({ socket: null, connectionState: 'connected' }) }));

const chat = (id) => ({ conversation_id: id, username: `c${id}`, type: 'direct' });

beforeEach(() => fetchConversations.mockReset());

// Day 70: the inbox a page at a time.
describe('useConversations pages', () => {
  it('loads the next page after the first, without listing a chat twice', async () => {
    fetchConversations
      .mockResolvedValueOnce({ conversations: [chat(5), chat(4)], nextCursor: 'p2' })
      .mockResolvedValueOnce({ conversations: [chat(4), chat(3)], nextCursor: null });
    const { result } = renderHook(() => useConversations('tok', 1));
    await waitFor(() => expect(result.current.nextCursor).toBe('p2'));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.conversations.map((c) => c.conversation_id)).toEqual([5, 4, 3]));
    expect(result.current.nextCursor).toBeNull();
    expect(fetchConversations).toHaveBeenLastCalledWith('tok', { cursor: 'p2' });
  });

  it('a reload starts over from the first page', async () => {
    fetchConversations
      .mockResolvedValueOnce({ conversations: [chat(5)], nextCursor: 'p2' })
      .mockResolvedValueOnce({ conversations: [chat(4)], nextCursor: null })
      .mockResolvedValueOnce({ conversations: [chat(6), chat(5)], nextCursor: 'p2b' });
    const { result } = renderHook(() => useConversations('tok', 1));
    await waitFor(() => expect(result.current.nextCursor).toBe('p2'));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.conversations.map((c) => c.conversation_id)).toEqual([6, 5]));
    expect(result.current.nextCursor).toBe('p2b');
  });
});
