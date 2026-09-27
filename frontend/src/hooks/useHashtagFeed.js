import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPostsByHashtag } from '../services/hashtagService';
import i18n from '../i18n';

const PAGE_LIMIT = 10;

// Same paginated-list shape as useFeed/useSavedPosts, backed by
// GET /hashtags/:tag/posts. Re-fetches from page 1 whenever `tag` changes
// (tapping a different hashtag link while already on a hashtag feed).
export function useHashtagFeed(tag, token) {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedTag, setLoadedTag] = useState(null);

  const pageRef = useRef(1);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const fetchFirstPage = useCallback(() => {
    const requestId = ++requestIdRef.current;
    fetchPostsByHashtag(tag, token, { page: 1, limit: PAGE_LIMIT })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = 1;
        setPosts(data.posts);
        setHasMore(Boolean(data.hasMore));
        setError(null);
        setLoadedTag(tag);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        setError(i18n.t('errors.loadHashtag'));
        setLoadedTag(tag);
      });
  }, [tag, token]);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  const loading = loadedTag !== tag;

  // For the error state's retry button (an event handler, so the
  // synchronous reset back into 'loading' is fine here).
  const reload = useCallback(() => {
    setLoadedTag(null);
    setError(null);
    fetchFirstPage();
  }, [fetchFirstPage]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    const requestId = ++requestIdRef.current;
    const nextPage = pageRef.current + 1;

    Promise.resolve()
      .then(() => {
        setLoadingMore(true);
        return fetchPostsByHashtag(tag, token, { page: nextPage, limit: PAGE_LIMIT });
      })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = nextPage;
        setPosts((current) => {
          const existingIds = new Set(current.map((post) => post.id));
          const newPosts = data.posts.filter((post) => !existingIds.has(post.id));
          return [...current, ...newPosts];
        });
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
      })
      .finally(() => {
        loadingMoreRef.current = false;
        if (requestId === requestIdRef.current) setLoadingMore(false);
      });
  }, [tag, token, hasMore]);

  return { posts, loading, loadingMore, error, hasMore, loadMore, reload };
}
