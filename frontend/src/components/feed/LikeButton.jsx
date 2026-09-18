import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DURATION_FAST, DURATION_NORMAL, EASE_STANDARD } from '../../utils/motionTokens';

// Purely presentational: all state and mutation logic lives in
// useLikeToggle (owned by PostCard), passed in as `like`. A single toggle
// button now that the feed actually returns per-post liked/count state,
// rather than two independent Like/Unlike actions with no visible state.
//
// Two distinct, separately-tuned micro-interactions: whileTap is the
// button's own press feedback (fires on every tap/click), while the inner
// AnimatePresence-driven label only re-animates when `likedByMe` actually
// changes. `initial={false}` on that AnimatePresence means a PostCard that
// mounts/remounts as it scrolls in and out of the virtualized list never
// plays the label's enter animation just from mounting -- only a genuine
// like/unlike click (a key change on an already-mounted instance) does.
function LikeButton({ like }) {
  const { likedByMe, likeCount, pending, error, toggle } = like;
  const reduceMotion = useReducedMotion();

  return (
    <span className="feed-like-actions">
      <motion.button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={likedByMe}
        aria-label={likedByMe ? 'Unlike this post' : 'Like this post'}
        className="feed-btn"
        whileTap={reduceMotion ? undefined : { scale: 0.92 }}
        transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={likedByMe ? 'liked' : 'unliked'}
            initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduceMotion ? undefined : { scale: 0.7, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : DURATION_NORMAL, ease: EASE_STANDARD }}
            style={{ display: 'inline-block' }}
          >
            {likedByMe ? 'Unlike' : 'Like'} ({likeCount})
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {error && (
        <span className="feed-error-text" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export default LikeButton;
