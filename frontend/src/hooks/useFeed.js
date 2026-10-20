import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFeed } from '../services/postService';
import i18n from '../i18n';
import { readFeed, saveFeed } from '../utils/offlineStore';

const PAGE_LIMIT = 20;

// Owns paginated feed state: initial load (`reload`, also used by the error
// state's retry) and incremental `loadMore` for infinite scroll. A single
// incrementing request id guards against stale responses -- if `reload` is
// called while a `loadMore` is in flight (or two loads somehow overlap), the
// older response is ignored instead of clobbering newer state.
// Day 72: the first page is kept on the device (utils/offlineStore); when
// Home can't load because the device is offline, those posts are shown
// (savedAt says so), and the feed reloads by itself once it's back online.
export function useFeed(token, userId) {
  const [posts, setPosts] = useState([]);
  const [savedAt, setSavedAt] = useState(null);
  const savedAtRef = useRef(null); // the same, for the request callbacks
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const pageRef = useRef(1);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);

  // No synchronous setState here -- `loading`/`error` already start at the
  // correct "about to load" defaults, so the mount effect below can call
  // this directly without triggering cascading renders (every state update
  // happens inside the .then()/.catch() callbacks, after the effect body
  // has already finished running).
  const fetchInitial = useCallback(() => {
    if (!token) return;
    const requestId = ++requestIdRef.current;

    fetchFeed(token, { page: 1, limit: PAGE_LIMIT })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = 1;
        setPosts(data.posts);
        setHasMore(Boolean(data.hasMore));
        setSavedAt(null);
        savedAtRef.current = null;
        setError(null);
        setLoading(false);
        saveFeed(userId, data.posts);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        const saved = typeof navigator !== 'undefined' && navigator.onLine === false ? readFeed(userId) : null;
        if (saved) {
          setPosts(saved.posts);
          setHasMore(false);
          setSavedAt(saved.savedAt);
          savedAtRef.current = saved.savedAt;
          setError(null);
        } else if (savedAtRef.current) {
          // Still showing the saved posts (a retry right after the
          // connection came back can fail too): keep them on screen.
        } else {
          console.error(err);
          setError(i18n.t('errors.loadFeed'));
        }
        setLoading(false);
      });
  }, [token, userId]);

  // Back online after showing saved posts, or after failing: load again --
  // at once, then after 2 and 6 seconds (the "online" event can come before
  // the network really works). A successful load ends it (savedAt and error
  // go null, which clears the timers below).
  useEffect(() => {
    if (!savedAt && !error) return undefined;
    const timers = [];
    const retry = () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
      fetchInitial();
      timers.push(setTimeout(fetchInitial, 2000), setTimeout(fetchInitial, 6000));
    };
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('online', retry);
      timers.forEach(clearTimeout);
    };
  }, [savedAt, error, fetchInitial]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // Used by the error state's "Try again" button -- a click handler, not an
  // effect, so resetting loading/error synchronously here for immediate
  // feedback is fine.
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(() => {
    if (!token || loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    const requestId = ++requestIdRef.current;
    const nextPage = pageRef.current + 1;

    // This is triggered from FeedList's scroll-position effect. Deferring
    // the "start loading" state update by one microtask keeps every
    // setState call behind an async boundary instead of running
    // synchronously inside that effect's call stack.
    Promise.resolve()
      .then(() => {
        setLoadingMore(true);
        return fetchFeed(token, { page: nextPage, limit: PAGE_LIMIT });
      })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = nextPage;
        setPosts((current) => {
          // Offset pagination can overlap if the underlying feed changed
          // between page requests -- de-dupe defensively rather than
          // switching to cursor pagination, which would be a bigger API
          // change than this step calls for.
          const existingIds = new Set(current.map((post) => post.id));
          const newPosts = data.posts.filter((post) => !existingIds.has(post.id));
          return [...current, ...newPosts];
        });
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        // hasMore stays true so scrolling near the bottom again retries.
      })
      .finally(() => {
        loadingMoreRef.current = false;
        if (requestId === requestIdRef.current) setLoadingMore(false);
      });
  }, [token, hasMore]);

  const removePost = useCallback((postId) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
  }, []);

  // Used after blocking a user (PostMenu) -- mutual invisibility means every
  // post of theirs should disappear from the feed immediately, not just the
  // one card the block action was taken from.
  const removePostsByUser = useCallback((userId) => {
    setPosts((current) => current.filter((post) => post.user_id !== userId));
  }, []);

  // Used after a successful edit (PostMenu -> PostCard) -- merges the
  // server's authoritative updated fields into the existing card rather
  // than refetching the whole feed for a one-field change.
  const updatePostContent = useCallback((postId, updatedFields) => {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, ...updatedFields } : post)));
  }, []);

  return {
    posts,
    savedAt,
    loading,
    loadingMore,
    error,
    hasMore,
    reload,
    loadMore,
    removePost,
    removePostsByUser,
    updatePostContent
  };
}
