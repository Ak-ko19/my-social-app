import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useComments } from './useComments';
import { fetchComments, updateComment } from '../services/postService';

vi.mock('../services/postService', () => ({
  fetchComments: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  likeComment: vi.fn(),
  unlikeComment: vi.fn()
}));

const ZAWGYI = 'ေမာင္ေမာင္';
const UNICODE = 'မောင်မောင်';

describe('useComments edit (Day 43)', () => {
  const open = async () => {
    fetchComments.mockResolvedValue({ comments: [{ id: 5, content: 'old', user_id: 1, username: 'ann' }], nextCursor: null });
    const hook = renderHook(() => useComments(9, 'tok', { userId: 1, username: 'ann' }));
    act(() => hook.result.current.toggleVisible());
    await waitFor(() => expect(hook.result.current.comments).toHaveLength(1));
    act(() => hook.result.current.startEdit(hook.result.current.comments[0]));
    act(() => hook.result.current.setEditText(ZAWGYI));
    return hook;
  };

  it("shows the server's text once saved (Zawgyi comes back as Unicode)", async () => {
    updateComment.mockResolvedValue({ id: 5, content: UNICODE });
    const { result } = await open();
    act(() => result.current.saveEdit());
    expect(result.current.comments[0].content).toBe(ZAWGYI); // optimistic
    await waitFor(() => expect(result.current.comments[0].content).toBe(UNICODE));
    expect(updateComment).toHaveBeenCalledWith(5, ZAWGYI, 'tok');
  });

  it('rolls back when saving fails', async () => {
    updateComment.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await open();
    act(() => result.current.saveEdit());
    await waitFor(() => expect(result.current.comments[0].content).toBe('old'));
    expect(result.current.editError).toBeTruthy();
  });
});

// Day 70: comments a page at a time.
describe('useComments pages', () => {
  const c = (id) => ({ id, content: `c${id}`, user_id: 2, username: 'bo' });

  it('loads the next page after the first, without repeats, until there is none', async () => {
    fetchComments.mockReset();
    fetchComments
      .mockResolvedValueOnce({ comments: [c(1), c(2)], nextCursor: '2' })
      .mockResolvedValueOnce({ comments: [c(2), c(3)], nextCursor: null });
    const { result } = renderHook(() => useComments(9, 'tok', { userId: 1, username: 'ann' }));
    act(() => result.current.toggleVisible());
    await waitFor(() => expect(result.current.nextCursor).toBe('2'));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.comments.map((x) => x.id)).toEqual([1, 2, 3]));
    expect(result.current.nextCursor).toBeNull();
    expect(fetchComments).toHaveBeenLastCalledWith(9, 'tok', { cursor: '2' });
  });

  it('keeps what it has and says so when the next page fails', async () => {
    fetchComments.mockReset();
    fetchComments.mockResolvedValueOnce({ comments: [c(1)], nextCursor: '1' }).mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useComments(9, 'tok', { userId: 1, username: 'ann' }));
    act(() => result.current.toggleVisible());
    await waitFor(() => expect(result.current.nextCursor).toBe('1'));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadMoreError).toBeTruthy());
    expect(result.current.comments.map((x) => x.id)).toEqual([1]);
    expect(result.current.nextCursor).toBe('1'); // can try again
    expect(result.current.loadingMore).toBe(false);
  });
});
