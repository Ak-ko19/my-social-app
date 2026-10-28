import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useFeed } from './useFeed';
import { fetchFeed } from '../services/postService';

vi.mock('../services/postService', () => ({ fetchFeed: vi.fn() }));

beforeEach(() => {
  fetchFeed.mockReset();
  localStorage.clear();
});

// Day 74: Home pages by the server's cursor, not by page number.
describe('useFeed paging', () => {
  it("asks for the next page with the last page's nextCursor, and stops when there is none", async () => {
    fetchFeed
      .mockResolvedValueOnce({ posts: [{ id: 3 }, { id: 2 }], hasMore: true, nextCursor: 'c1' })
      .mockResolvedValueOnce({ posts: [{ id: 2 }, { id: 1 }], hasMore: false, nextCursor: null });
    const { result } = renderHook(() => useFeed('tok', 7));
    await waitFor(() => expect(result.current.posts).toHaveLength(2));
    expect(fetchFeed).toHaveBeenLastCalledWith('tok', { limit: 20 });

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(fetchFeed).toHaveBeenLastCalledWith('tok', { cursor: 'c1', limit: 20 });
    expect(result.current.posts.map((p) => p.id)).toEqual([3, 2, 1]);

    act(() => result.current.loadMore());
    expect(fetchFeed).toHaveBeenCalledTimes(2);
  });
});

// Days 107-108: "Unfollow #tag" on a Home post.
describe('useFeed removePostsByTag', () => {
  it("drops the posts that tag brought, keeping ones there for another reason (via_hashtag null) or another tag", async () => {
    fetchFeed.mockResolvedValueOnce({ posts: [
      { id: 4, via_hashtag: 'tea' }, { id: 3, via_hashtag: null }, { id: 2, via_hashtag: 'coffee' }, { id: 1, via_hashtag: 'tea' }
    ], hasMore: false, nextCursor: null });
    const { result } = renderHook(() => useFeed('tok', 7));
    await waitFor(() => expect(result.current.posts).toHaveLength(4));
    act(() => result.current.removePostsByTag('tea'));
    expect(result.current.posts.map((p) => p.id)).toEqual([3, 2]);
  });
});
