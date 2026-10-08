import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBookmarks } from '../services/bookmarkService';
import { fetchCollectionPosts } from '../services/collectionService';
import i18n from '../i18n';

const PAGE_LIMIT = 10;

// Paginated saved-posts list -- same shape as useFeed (initial load +
// incremental loadMore, request-id guard against stale responses), just
// backed by GET /bookmarks instead of GET /feed -- or (Day 46) by one
// collection's posts, when collectionId is given (then `collection` holds
// its name, and `notFound` is set when it isn't yours or is gone).
export function useSavedPosts(token, collectionId = null) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [collection, setCollection] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const pageRef = useRef(1);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const fetchPage = useCallback(
    (page) => (collectionId
      ? fetchCollectionPosts(collectionId, token, { page, limit: PAGE_LIMIT })
      : fetchBookmarks(token, { page, limit: PAGE_LIMIT })),
    [collectionId, token]
  );

  const fetchInitial = useCallback(() => {
    if (!token) return;
    const requestId = ++requestIdRef.current;

    fetchPage(1)
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = 1;
        if (data.collection) setCollection(data.collection);
        setPosts(data.posts);
        setHasMore(Boolean(data.hasMore));
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        if (collectionId && err.response?.status === 404) setNotFound(true);
        setError(i18n.t(collectionId ? 'collections.loadFailed' : 'errors.loadSaved'));
        setLoading(false);
      });
  }, [token, collectionId, fetchPage]);

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
        return fetchPage(nextPage);
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
  }, [token, hasMore, fetchPage]);

  // A post unsaved from within the list (the bookmark button toggled off
  // while viewing Saved Posts) should disappear immediately, same as
  // useFeed.removePost after a delete.
  const removePost = useCallback((postId) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
  }, []);

  const updatePostContent = useCallback((postId, updatedFields) => {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, ...updatedFields } : post)));
  }, []);

  return { posts, loading, loadingMore, error, hasMore, reload, loadMore, removePost, updatePostContent, collection, setCollection, notFound };
}
