import { useCallback, useEffect, useState } from 'react';
import { searchHashtags, searchPosts, searchUsers } from '../services/searchService';

const EMPTY = { key: null, status: 'ready', users: [], hashtags: [], posts: [], page: 1, hasMore: false };

// Day 42: one search loads people, hashtags and the first page of posts
// together, so the All / People / Posts / Hashtags tabs switch instantly.
// `status` is 'idle' (no query), 'loading', 'error' or 'ready'. A newer
// query's results always win: older answers are dropped by key.
export function useSearch(query, token) {
  const [result, setResult] = useState(EMPTY);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${attempt}:${query}`;

  useEffect(() => {
    if (!query) return undefined;
    let cancelled = false;
    // Just '#' is no tag to look for (the API would refuse it).
    const tags = query.replace(/^#+/, '') ? searchHashtags(query, token) : Promise.resolve([]);
    Promise.all([searchUsers(query, token), tags, searchPosts(query, token)])
      .then(([users, hashtags, posts]) => {
        if (!cancelled) setResult({ key, status: 'ready', users, hashtags, posts: posts.posts, page: 1, hasMore: Boolean(posts.hasMore) });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setResult({ ...EMPTY, key, status: 'error' });
      });
    return () => { cancelled = true; };
  }, [query, token, key]);

  const loadMorePosts = useCallback(() => {
    if (loadingMore || !result.hasMore || result.key !== key) return;
    setLoadingMore(true);
    searchPosts(query, token, result.page + 1)
      .then((data) => setResult((current) => (current.key !== key ? current : {
        ...current,
        posts: [...current.posts, ...data.posts.filter((p) => !current.posts.some((c) => c.id === p.id))],
        page: current.page + 1,
        hasMore: Boolean(data.hasMore)
      })))
      .catch((err) => console.error(err))
      .finally(() => setLoadingMore(false));
  }, [query, token, key, loadingMore, result.hasMore, result.key, result.page]);

  // For the error state's Retry button.
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  let status = result.status;
  if (!query) status = 'idle';
  else if (result.key !== key) status = 'loading';
  const shown = status === 'ready' ? result : EMPTY;
  return { status, users: shown.users, hashtags: shown.hashtags, posts: shown.posts, hasMore: shown.hasMore, loadingMore, loadMorePosts, retry };
}
