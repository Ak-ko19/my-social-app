import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchUserPosts } from '../services/profileService';
import { fetchBookmarks } from '../services/bookmarkService';
import i18n from '../i18n';

const PAGE_LIMIT = 12;

// One profile tab's paginated posts (B6). 'saved' is the viewer's own
// bookmarks; the other tabs come from GET /users/:id/posts?tab=... .
// Same shape as useSavedPosts (initial load + loadMore + stale-response
// guard). A 403 means "private account you don't follow" -- surfaced as
// `isPrivate`, not as an error, so the screen can explain it properly.
export function useProfileTabPosts(userId, tab, token) {
  const [posts, setPosts] = useState([]);
  const [loadedKey, setLoadedKey] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const key = `${userId}:${tab}`;
  const pageRef = useRef(1);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(
    (page) =>
      tab === 'saved'
        ? fetchBookmarks(token, { page, limit: PAGE_LIMIT })
        : fetchUserPosts(userId, tab, token, { page, limit: PAGE_LIMIT }),
    [userId, tab, token]
  );

  const fetchInitial = useCallback(() => {
    const requestId = ++requestIdRef.current;
    fetchPage(1)
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = 1;
        // Day 36: the posts tab's pinned post (page 1 only) goes first.
        setPosts(data.pinned ? [data.pinned, ...data.posts] : data.posts);
        setHasMore(Boolean(data.hasMore));
        setError(null);
        setIsPrivate(false);
        setLoadedKey(key);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        if (err.response?.status === 403) {
          setIsPrivate(true);
          setError(null);
        } else {
          console.error(err);
          setError(i18n.t('errors.loadPosts'));
          setIsPrivate(false);
        }
        setPosts([]);
        setHasMore(false);
        setLoadedKey(key);
      });
  }, [fetchPage, key]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // Derived, so switching tabs re-enters "loading" without a synchronous
  // setState inside the effect above.
  const loading = loadedKey !== key;

  const reload = useCallback(() => {
    setLoadedKey(null);
    fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    const requestId = ++requestIdRef.current;
    const nextPage = pageRef.current + 1;
    setLoadingMore(true);
    fetchPage(nextPage)
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = nextPage;
        setPosts((current) => {
          const existingIds = new Set(current.map((p) => p.id));
          return [...current, ...data.posts.filter((p) => !existingIds.has(p.id))];
        });
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        setError(i18n.t('errors.loadMorePosts'));
      })
      .finally(() => {
        loadingMoreRef.current = false;
        if (requestId === requestIdRef.current) setLoadingMore(false);
      });
  }, [fetchPage, hasMore]);

  // Lets a PostCard's delete/block remove the post from the visible tab.
  const removePost = useCallback((postId) => setPosts((current) => current.filter((p) => p.id !== postId)), []);

  return { posts, loading, loadingMore, error, isPrivate, hasMore, loadMore, reload, removePost };
}
