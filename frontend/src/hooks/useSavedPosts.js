import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBookmarks } from '../services/bookmarkService';

const PAGE_LIMIT = 10;

// Paginated saved-posts list -- same shape as useFeed (initial load +
// incremental loadMore, request-id guard against stale responses), just
// backed by GET /bookmarks instead of GET /feed.
export function useSavedPosts(token) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const pageRef = useRef(1);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const fetchInitial = useCallback(() => {
    if (!token) return;
    const requestId = ++requestIdRef.current;

    fetchBookmarks(token, { page: 1, limit: PAGE_LIMIT })
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
        setError('Failed to load saved posts');
        setLoading(false);
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
    if (!token || loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    const requestId = ++requestIdRef.current;
    const nextPage = pageRef.current + 1;

    Promise.resolve()
      .then(() => {
        setLoadingMore(true);
        return fetchBookmarks(token, { page: nextPage, limit: PAGE_LIMIT });
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
  }, [token, hasMore]);

  // A post unsaved from within the list (the bookmark button toggled off
  // while viewing Saved Posts) should disappear immediately, same as
  // useFeed.removePost after a delete.
  const removePost = useCallback((postId) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
  }, []);

  const updatePostContent = useCallback((postId, updatedFields) => {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, ...updatedFields } : post)));
  }, []);

  return { posts, loading, loadingMore, error, hasMore, reload, loadMore, removePost, updatePostContent };
}
