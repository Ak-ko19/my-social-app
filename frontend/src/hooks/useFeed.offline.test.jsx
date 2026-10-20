import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useFeed } from './useFeed';
import { fetchFeed } from '../services/postService';
import { saveFeed } from '../utils/offlineStore';
import OfflineBanner from '../components/layout/OfflineBanner';
import { setLanguage } from '../i18n';

vi.mock('../services/postService', () => ({ fetchFeed: vi.fn() }));

const setOnline = (value) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

beforeEach(async () => {
  fetchFeed.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await setLanguage('en');
});
afterEach(() => {
  setOnline(true);
  localStorage.clear();
  vi.restoreAllMocks();
});

// Day 72: Home offline.
describe('useFeed offline', () => {
  it('online: shows the feed and keeps a copy', async () => {
    fetchFeed.mockResolvedValue({ posts: [{ id: 1, content: 'hi' }], hasMore: false });
    const { result } = renderHook(() => useFeed('tok', 7));
    await waitFor(() => expect(result.current.posts).toHaveLength(1));
    expect(result.current.savedAt).toBeNull();
    expect(JSON.parse(localStorage.getItem('offline:feed:7')).posts).toEqual([{ id: 1, content: 'hi' }]);
  });

  it('offline: shows the saved posts, then loads for real once back online', async () => {
    saveFeed(7, [{ id: 1, content: 'saved' }]);
    setOnline(false);
    fetchFeed.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({ posts: [{ id: 2, content: 'fresh' }], hasMore: false });
    const { result } = renderHook(() => useFeed('tok', 7));
    await waitFor(() => expect(result.current.savedAt).not.toBeNull());
    expect(result.current.posts.map((p) => p.content)).toEqual(['saved']);
    expect(result.current.error).toBeNull();
    act(() => setOnline(true));
    await waitFor(() => expect(result.current.posts.map((p) => p.content)).toEqual(['fresh']));
    expect(result.current.savedAt).toBeNull();
  });

  it('the first try after coming back can fail too: the saved posts stay, and a later try loads', async () => {
    saveFeed(7, [{ id: 1, content: 'saved' }]);
    setOnline(false);
    fetchFeed
      .mockRejectedValueOnce(new Error('Network Error')) // offline
      .mockRejectedValueOnce(new Error('Network Error')) // "online", but not yet really
      .mockResolvedValueOnce({ posts: [{ id: 2, content: 'fresh' }], hasMore: false });
    const { result } = renderHook(() => useFeed('tok', 7));
    await waitFor(() => expect(result.current.savedAt).not.toBeNull());
    act(() => setOnline(true));
    await waitFor(() => expect(fetchFeed).toHaveBeenCalledTimes(2));
    expect(result.current.posts.map((p) => p.content)).toEqual(['saved']);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.posts.map((p) => p.content)).toEqual(['fresh']), { timeout: 4000 });
  });

  it("offline with nothing saved (or another account's copy) is an ordinary error", async () => {
    saveFeed(8, [{ id: 1 }]);
    setOnline(false);
    fetchFeed.mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useFeed('tok', 7));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.posts).toEqual([]);
  });

  it('a failure while online never shows old posts', async () => {
    saveFeed(7, [{ id: 1 }]);
    fetchFeed.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useFeed('tok', 7));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.posts).toEqual([]);
  });
});

describe('OfflineBanner', () => {
  it('appears while offline and goes when back online', async () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => setOnline(false));
    expect(await screen.findByRole('status')).toHaveTextContent("You're offline");
    act(() => setOnline(true));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
