import { useCallback, useRef, useState } from 'react';
import { bookmarkPost, unbookmarkPost } from '../services/bookmarkService';
import i18n from '../i18n';
import { serverText } from '../utils/serverError';

const ALREADY_BOOKMARKED_MESSAGE = 'You have already bookmarked this post';
const NOT_BOOKMARKED_MESSAGE = 'You have not bookmarked this post';

// Optimistic bookmark toggle for a single post -- same shape as
// useLikeToggle (seeds from the feed's own bookmarked_by_me field, flips
// immediately, reconciles/reverts based on the exact conflict messages the
// backend sends), just without a count to reconcile.
export function useBookmarkToggle(postId, initialBookmarked, token) {
  const [bookmarked, setBookmarked] = useState(Boolean(initialBookmarked));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(false);

  const toggle = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);

    const wasBookmarked = bookmarked;
    const nextBookmarked = !wasBookmarked;
    setBookmarked(nextBookmarked);

    const action = nextBookmarked ? bookmarkPost : unbookmarkPost;

    action(postId, token)
      .catch((err) => {
        console.error(err);
        const message = err.response?.data;
        const alreadyInTargetState = message === ALREADY_BOOKMARKED_MESSAGE || message === NOT_BOOKMARKED_MESSAGE;
        if (!alreadyInTargetState) {
          setBookmarked(wasBookmarked);
        }
        setError(message ? serverText(message) : i18n.t(nextBookmarked ? 'errors.bookmark' : 'errors.unbookmark'));
      })
      .finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
  }, [bookmarked, postId, token]);

  return { bookmarked, pending, error, toggle };
}
