import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { DURATION_FAST, EASE_STANDARD } from '../../utils/motionTokens';

// Purely presentational: all state and mutation logic lives in
// useFollowToggle (owned by PostCard), passed in as `follow`. Same subtle
// tap feedback as LikeButton/CommentButton for consistency, without the
// extra label-swap animation (only Like's state transition was asked for).
function FollowButton({ follow }) {
  const { t } = useTranslation();
  const { isFollowing, requested, pending, error, toggle } = follow;
  const reduceMotion = useReducedMotion();

  return (
    <span className="feed-follow-actions">
      <motion.button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isFollowing}
        className="feed-btn"
        whileTap={reduceMotion ? undefined : { scale: 0.92 }}
        transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
      >
        {isFollowing ? (requested ? t('follow.requested') : t('follow.following')) : t('follow.follow')}
      </motion.button>
      {error && (
        <span className="feed-error-text" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export default FollowButton;
