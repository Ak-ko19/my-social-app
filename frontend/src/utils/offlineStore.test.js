import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearOfflineData, readFeed, saveFeed } from './offlineStore';
import { clearLocalSession } from '../hooks/useAuth';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// Day 72: what is kept on the device to work offline.
describe('offlineStore', () => {
  it('keeps the newest 20 Home posts per account', () => {
    saveFeed(1, Array.from({ length: 25 }, (_, i) => ({ id: i })));
    saveFeed(2, [{ id: 99 }]);
    expect(readFeed(1).posts).toHaveLength(20);
    expect(readFeed(1).posts[0].id).toBe(0);
    expect(readFeed(2).posts).toEqual([{ id: 99 }]);
    expect(readFeed(3)).toBeNull();
    expect(Date.parse(readFeed(1).savedAt)).not.toBeNaN();
  });

  it('logging out wipes every offline copy (a shared phone), and nothing else of the app', () => {
    saveFeed(1, [{ id: 1 }]);
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('token', 't');
    clearLocalSession();
    expect(readFeed(1)).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('a full or blocked storage keeps nothing, without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => saveFeed(1, [{ id: 1 }])).not.toThrow();
    vi.restoreAllMocks();
    expect(readFeed(1)).toBeNull();
    localStorage.setItem('offline:feed:1', '{not json');
    expect(readFeed(1)).toBeNull();
    expect(() => clearOfflineData()).not.toThrow();
  });
});
