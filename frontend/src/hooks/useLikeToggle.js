import { useCallback, useRef, useState } from 'react';
import { likePost, unlikePost } from '../services/postService';

// Exact wording the backend already sends for these two conflict cases
// (see backend/controllers/likeController.js) -- matched precisely so we
// only special-case a genuine "already in that state" conflict, not any
// other 400/404.
const ALREADY_LIKED_MESSAGE = 'You already liked this post';
const NOT_LIKED_MESSAGE = 'You have not liked this post';

// Optimistic like/unlike for a single post. Seeds from GET /feed's own
// liked_by_me/like_count fields and owns its own client-side state from
// then on -- this app has no real-time sync between tabs/sessions, so once
// mounted, this is the source of truth for that card until it unmounts.
export function useLikeToggle(postId, initial, token) {
  const [likedByMe, setLikedByMe] = useState(Boolean(initial.likedByMe));
  const [likeCount, setLikeCount] = useState(Number(initial.likeCount) || 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(false);

  const toggle = useCallback(() => {
    if (pendingRef.current) return; // duplicate/rapid-click guard
    pendingRef.current = true;
    setPending(true);
    setError(null);

    const wasLiked = likedByMe;
    const previousCount = likeCount;
    const nextLiked = !wasLiked;
    const optimisticCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));

    // Immediate local UI update, before the request is even sent.
    setLikedByMe(nextLiked);
    setLikeCount(optimisticCount);

    const action = nextLiked ? likePost : unlikePost;

    action(postId, token)
      .then((data) => {
        // Reconcile with the server's authoritative count rather than
        // trusting our own +1/-1 math indefinitely.
        if (typeof data?.likeCount === 'number') {
          setLikeCount(data.likeCount);
        }
      })
      .catch((err) => {
        console.error(err);
        const message = err.response?.data;
        const alreadyInTargetState = message === ALREADY_LIKED_MESSAGE || message === NOT_LIKED_MESSAGE;

        if (alreadyInTargetState) {
          // The server was already in the state we were trying to reach,
          // which means our optimistic liked flag was actually correct --
          // only the count bump needs undoing, since nothing was actually
          // inserted/deleted server-side.
          setLikeCount(previousCount);
        } else {
          // Genuine failure (network error, expired auth, 404, 500, ...) --
          // the mutation never took effect, so revert fully.
          setLikedByMe(wasLiked);
          setLikeCount(previousCount);
        }
        setError(message || (nextLiked ? 'Failed to like post' : 'Failed to unlike post'));
      })
      .finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
  }, [likedByMe, likeCount, postId, token]);

  return { likedByMe, likeCount, pending, error, toggle };
}
