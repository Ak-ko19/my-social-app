import { useCallback, useRef, useState } from 'react';
import { followUser, unfollowUser } from '../services/postService';

// Exact wording the backend already sends for these two conflict cases
// (see backend/controllers/followController.js).
const ALREADY_FOLLOWING_MESSAGE = 'You are already following this user';
const NOT_FOLLOWING_MESSAGE = 'You are not following this user';

// Optimistic follow/unfollow toggle. Seeds from GET /feed's own
// is_following field (every post in the Home feed is, by construction, from
// someone already followed -- so this starts true there, but the hook
// itself doesn't assume that; it just reflects whatever it's given).
export function useFollowToggle(userId, initialIsFollowing, token) {
  const [isFollowing, setIsFollowing] = useState(Boolean(initialIsFollowing));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(false);

  const toggle = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);

    const wasFollowing = isFollowing;
    const nextFollowing = !wasFollowing;
    setIsFollowing(nextFollowing);

    const action = nextFollowing ? followUser : unfollowUser;

    action(userId, token)
      .catch((err) => {
        console.error(err);
        const message = err.response?.data;
        const alreadyInTargetState = message === ALREADY_FOLLOWING_MESSAGE || message === NOT_FOLLOWING_MESSAGE;

        // Same reasoning as useLikeToggle: a conflict response here means
        // the server was already in the state we were aiming for, so the
        // optimistic flag was correct and there's nothing to roll back.
        if (!alreadyInTargetState) {
          setIsFollowing(wasFollowing);
        }
        setError(message || (nextFollowing ? 'Failed to follow' : 'Failed to unfollow'));
      })
      .finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
  }, [isFollowing, userId, token]);

  return { isFollowing, pending, error, toggle };
}
