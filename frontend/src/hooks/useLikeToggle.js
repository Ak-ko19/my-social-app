import { useCallback, useRef, useState } from 'react';
import { likePost, unlikePost, setReaction } from '../services/postService';
import i18n from '../i18n';
import { serverText } from '../utils/serverError';

// Exact wording the backend sends for these two conflict cases (see
// backend/controllers/likeController.js) -- matched precisely so we only
// special-case a genuine "already in that state" conflict.
const ALREADY_LIKED_MESSAGE = 'You already liked this post';
const NOT_LIKED_MESSAGE = 'You have not liked this post';

function bump(counts, key, delta) {
  if (!key) return counts;
  const next = { ...counts, [key]: (counts[key] || 0) + delta };
  if (next[key] <= 0) delete next[key];
  return next;
}

// Optimistic reactions for a single post (B1; a "like" is the default
// reaction). Seeds from the post payload's my_reaction/reaction_counts/
// like_count and owns its own client-side state from then on -- this app
// has no real-time sync between sessions, so once mounted, this is the
// source of truth for that card until it unmounts.
//
//   toggle()     -- the Like button's tap: no reaction -> 'like',
//                   any reaction -> remove it.
//   react(type)  -- a picker choice: set/change to `type`, or remove it if
//                   it's already the current reaction.
//
// Every mutation reconciles with the server's authoritative summary.
export function useLikeToggle(postId, initial, token) {
  const seededReaction = initial.myReaction ?? (initial.likedByMe ? 'like' : null);
  const [myReaction, setMyReaction] = useState(seededReaction);
  const [likeCount, setLikeCount] = useState(Number(initial.likeCount) || 0);
  const [reactionCounts, setReactionCounts] = useState(
    initial.reactionCounts || (initial.likedByMe || initial.likeCount ? { like: Number(initial.likeCount) || 0 } : {})
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(false);

  const mutate = useCallback(
    (nextReaction) => {
      if (pendingRef.current) return; // duplicate/rapid-click guard
      pendingRef.current = true;
      setPending(true);
      setError(null);

      const previous = { myReaction, likeCount, reactionCounts };

      // Immediate local update, before the request is sent.
      setMyReaction(nextReaction);
      setLikeCount(Math.max(0, likeCount + (nextReaction ? 1 : 0) - (myReaction ? 1 : 0)));
      setReactionCounts(bump(bump(reactionCounts, myReaction, -1), nextReaction, 1));

      let request;
      if (!nextReaction) request = unlikePost(postId, token);
      else if (!myReaction && nextReaction === 'like') request = likePost(postId, token);
      else request = setReaction(postId, nextReaction, token);

      request
        .then((data) => {
          if (typeof data?.likeCount === 'number') setLikeCount(data.likeCount);
          if (data?.reactionCounts) setReactionCounts(data.reactionCounts);
        })
        .catch((err) => {
          console.error(err);
          const message = err.response?.data;
          const alreadyInTargetState = message === ALREADY_LIKED_MESSAGE || message === NOT_LIKED_MESSAGE;
          if (alreadyInTargetState) {
            // The server was already where we were going -- keep the
            // optimistic reaction, only undo the count bump.
            setLikeCount(previous.likeCount);
            setReactionCounts(previous.reactionCounts);
          } else {
            // Genuine failure -- the mutation never took effect.
            setMyReaction(previous.myReaction);
            setLikeCount(previous.likeCount);
            setReactionCounts(previous.reactionCounts);
          }
          setError(typeof message === 'string' ? serverText(message) : i18n.t('errors.reaction'));
        })
        .finally(() => {
          pendingRef.current = false;
          setPending(false);
        });
    },
    [myReaction, likeCount, reactionCounts, postId, token]
  );

  const toggle = useCallback(() => mutate(myReaction ? null : 'like'), [mutate, myReaction]);
  const react = useCallback((type) => mutate(type === myReaction ? null : type), [mutate, myReaction]);

  return {
    myReaction,
    likedByMe: myReaction !== null,
    likeCount,
    reactionCounts,
    pending,
    error,
    toggle,
    react
  };
}
