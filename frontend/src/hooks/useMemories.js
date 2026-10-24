import { useCallback, useEffect, useState } from 'react';
import { fetchMemories } from '../services/memoryService';

// Days 83-84: today's memories. data: { date, memories } once loaded.
export function useMemories(token) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    fetchMemories(token)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [token, attempt]);

  const reload = useCallback(() => {
    setError(false);
    setData(null);
    setAttempt((n) => n + 1);
  }, []);

  // A post deleted or edited from its card.
  const removePost = useCallback((id) => setData((d) => d && {
    ...d,
    memories: d.memories.map((m) => ({ ...m, posts: m.posts.filter((p) => p.id !== id) })).filter((m) => m.posts.length > 0)
  }), []);
  const updatePost = useCallback((id, changes) => setData((d) => d && {
    ...d,
    memories: d.memories.map((m) => ({ ...m, posts: m.posts.map((p) => (p.id === id ? { ...p, ...changes } : p)) }))
  }), []);

  return { data, loading: !data && !error, error, reload, removePost, updatePost };
}
