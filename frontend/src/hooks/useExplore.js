import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTrendingHashtags, fetchPopularPosts } from '../services/exploreService';
import i18n from '../i18n';

// Trending hashtags (one small list, no paging). A secondary strip: the
// screen works without it, and since Day 80 a failure says so (failed +
// retry) instead of looking like "nothing trending".
export function useTrendingHashtags(token) {
  const [tags, setTags] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Day 80: a failed load is not "nothing trending" -- it says so, with retry.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchTrendingHashtags(token)
      .then((data) => {
        if (!cancelled) {
          setTags(data);
          setFailed(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { tags, loaded, failed, retry };
}

// Popular posts, paginated -- same shape as useSavedPosts.
export function usePopularPosts(token) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const fetchInitial = useCallback(() => {
    const requestId = ++requestIdRef.current;
    fetchPopularPosts(token, { page: 1 })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = 1;
        setPosts(data.posts);
        setHasMore(Boolean(data.hasMore));
        setError(null);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        setError(i18n.t('errors.loadPopular'));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    const requestId = ++requestIdRef.current;
    const nextPage = pageRef.current + 1;
    setLoadingMore(true);
    fetchPopularPosts(token, { page: nextPage })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = nextPage;
        setPosts((current) => {
          const seen = new Set(current.map((p) => p.id));
          return [...current, ...data.posts.filter((p) => !seen.has(p.id))];
        });
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => console.error(err))
      .finally(() => {
        loadingMoreRef.current = false;
        if (requestId === requestIdRef.current) setLoadingMore(false);
      });
  }, [token, hasMore]);

  const removePost = useCallback((postId) => setPosts((current) => current.filter((p) => p.id !== postId)), []);

  return { posts, loading, loadingMore, error, hasMore, loadMore, reload, removePost };
}
