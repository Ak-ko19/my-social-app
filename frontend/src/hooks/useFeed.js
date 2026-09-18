import { useCallback, useEffect, useState } from 'react';
import { fetchFeed } from '../services/postService';

// Owns the feed's posts/loading/error state. `reload` preserves the
// original component's "refetch after a successful like/unlike" behavior;
// `removePost` supports local removal after a post is deleted.
export function useFeed(token) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    if (!token) return;
    fetchFeed(token)
      .then((data) => {
        setPosts(data.posts);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load feed');
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const removePost = useCallback((postId) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
  }, []);

  return { posts, loading, error, reload, removePost };
}
