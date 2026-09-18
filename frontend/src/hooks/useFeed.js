import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFeed } from '../services/postService';

const PAGE_LIMIT = 20;

// Owns paginated feed state: initial load (`reload`, also used by the error
// state's retry) and incremental `loadMore` for infinite scroll. A single
// incrementing request id guards against stale responses -- if `reload` is
// called while a `loadMore` is in flight (or two loads somehow overlap), the
// older response is ignored instead of clobbering newer state.
export function useFeed(token) {
  const [posts, setPosts] = useState([]);
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
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        setError('Failed to load feed');
        setLoading(false);
      });
  }, [token]);

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

  return { posts, loading, loadingMore, error, hasMore, reload, loadMore, removePost };
}
