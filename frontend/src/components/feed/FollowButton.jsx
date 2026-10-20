import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useTranslation } from 'react-i18next';
import { DURATION_FAST, EASE_STANDARD } from '../../utils/motionTokens';

// Purely presentational: all state and mutation logic lives in
// useFollowToggle (owned by PostCard), passed in as `follow`. A subtle
// tap feedback, without a label-swap animation.
function FollowButton({ follow }) {
  const { t } = useTranslation();
  const { isFollowing, requested, pending, error, toggle } = follow;
  const reduceMotion = useReducedMotion();

  return (
    <span className="feed-follow-actions">
      <m.button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isFollowing}
        className="feed-btn"
        whileTap={reduceMotion ? undefined : { scale: 0.92 }}
        transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
      >
        {isFollowing ? (requested ? t('follow.requested') : t('follow.following')) : t('follow.follow')}
      </m.button>
      {error && (
        <span className="feed-error-text" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export default FollowButton;
