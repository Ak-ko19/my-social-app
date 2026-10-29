import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useComments } from './useComments';
import { createComment, fetchComments, fetchReplies, pinComment, unpinComment, updateComment } from '../services/postService';

vi.mock('../services/postService', () => ({
  fetchComments: vi.fn(),
  fetchReplies: vi.fn(),
  pinComment: vi.fn(),
  unpinComment: vi.fn(),
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
    expect(fetchComments).toHaveBeenLastCalledWith(9, 'tok', { cursor: '2', sort: 'relevant' });
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

// Days 109-110: threads, Most relevant / Newest, more replies.
describe('useComments threads', () => {
  const top = (id, extra = {}) => ({ id, content: `t${id}`, user_id: 2, username: 'bo', parent_comment_id: null, reply_count: 0, ...extra });
  const reply = (id, parent) => ({ id, content: `r${id}`, user_id: 3, username: 'cy', parent_comment_id: parent });
  const open = async (page) => {
    fetchComments.mockReset();
    fetchReplies.mockReset();
    createComment.mockReset();
    fetchComments.mockResolvedValueOnce(page);
    const hook = renderHook(() => useComments(9, 'tok', { userId: 1, username: 'ann' }));
    act(() => hook.result.current.toggleVisible());
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    return hook;
  };

  it('starts on Most relevant; Newest starts the list again in that order', async () => {
    const { result } = await open({ sort: 'relevant', comments: [top(1)], nextCursor: '1' });
    expect(fetchComments).toHaveBeenLastCalledWith(9, 'tok', { sort: 'relevant' });
    fetchComments.mockResolvedValueOnce({ sort: 'newest', comments: [top(2), top(1)], nextCursor: null });
    act(() => result.current.changeSort('newest'));
    expect(result.current.sort).toBe('newest');
    expect(result.current.comments).toEqual([]);
    await waitFor(() => expect(result.current.comments.map((c) => c.id)).toEqual([2, 1]));
    expect(fetchComments).toHaveBeenLastCalledWith(9, 'tok', { sort: 'newest' });
    expect(result.current.nextCursor).toBeNull();
  });

  it("more replies go on after the server's last one, not after a reply you just wrote", async () => {
    const { result } = await open({ sort: 'relevant', comments: [top(1, { reply_count: 4 }), reply(10, 1), reply(11, 1)], nextCursor: null });
    createComment.mockResolvedValue({ id: 99, content: 'mine', user_id: 1, parent_comment_id: 1 });
    act(() => result.current.startReply(result.current.comments[0]));
    act(() => result.current.setCommentInput('mine'));
    act(() => result.current.submitComment());
    await waitFor(() => expect(result.current.comments.some((c) => c.id === 99)).toBe(true));
    expect(result.current.comments[0].reply_count).toBe(5);

    fetchReplies.mockResolvedValue({ replies: [reply(12, 1), reply(13, 1)], nextCursor: null });
    act(() => result.current.loadReplies(1));
    expect(fetchReplies).toHaveBeenCalledWith(1, 'tok', { cursor: 11 });
    await waitFor(() => expect(result.current.comments.map((c) => c.id)).toEqual([1, 10, 11, 99, 12, 13]));
  });

  it('a new comment goes to the top; a failed reply gives its count back', async () => {
    const { result } = await open({ sort: 'relevant', comments: [top(1, { reply_count: 1 }), reply(10, 1)], nextCursor: null });
    createComment.mockResolvedValueOnce({ id: 50, content: 'new', user_id: 1, parent_comment_id: null });
    act(() => result.current.setCommentInput('new'));
    act(() => result.current.submitComment());
    await waitFor(() => expect(result.current.comments[0].id).toBe(50));

    vi.spyOn(console, 'error').mockImplementation(() => {});
    createComment.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.startReply(result.current.comments[1]));
    act(() => result.current.setCommentInput('oops'));
    act(() => result.current.submitComment());
    await waitFor(() => expect(result.current.submitError).toBeTruthy());
    expect(result.current.comments.find((c) => c.id === 1).reply_count).toBe(1);
  });
});

// Days 109-110: the post's author pins a comment.
describe('useComments pin', () => {
  const top = (id, extra = {}) => ({ id, content: `t${id}`, user_id: 2, username: 'bo', parent_comment_id: null, reply_count: 0, is_pinned: false, ...extra });
  const open = async () => {
    fetchComments.mockReset();
    fetchComments.mockResolvedValueOnce({ sort: 'relevant', comments: [top(1, { is_pinned: true }), top(2), top(3), { id: 9, parent_comment_id: 3, content: 'r', user_id: 2, username: 'bo' }], nextCursor: null });
    const hook = renderHook(() => useComments(7, 'tok', { userId: 1, username: 'ann' }));
    act(() => hook.result.current.toggleVisible());
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    return hook;
  };
  const shape = (list) => list.map((c) => `${c.id}${c.is_pinned ? '*' : ''}`);

  it('pinning moves it to the top and unmarks the old one; unpinning leaves it in place', async () => {
    pinComment.mockResolvedValue({ pinned_comment_id: 3 });
    unpinComment.mockResolvedValue({ pinned_comment_id: null });
    const { result } = await open();
    act(() => { result.current.setPinned(3); });
    expect(shape(result.current.comments)).toEqual(['3*', '1', '2', '9']);
    expect(pinComment).toHaveBeenCalledWith(7, 3, 'tok');
    act(() => { result.current.setPinned(null); });
    expect(shape(result.current.comments)).toEqual(['3', '1', '2', '9']);
    expect(unpinComment).toHaveBeenCalledWith(7, 'tok');
  });

  it('puts everything back and says so when the server refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pinComment.mockRejectedValue({ response: { status: 403, data: "Only the post's author can pin a comment." } });
    const { result } = await open();
    act(() => { result.current.setPinned(2); });
    await waitFor(() => expect(result.current.actionError).toBe("Only the post's author can pin a comment."));
    expect(shape(result.current.comments)).toEqual(['1*', '2', '3', '9']);
  });
});
