import { motion, useReducedMotion } from 'motion/react';
import { DURATION_FAST, EASE_STANDARD } from '../../utils/motionTokens';

function CommentButton({ expanded, onToggle }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="feed-btn feed-btn-action"
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
    >
      {expanded ? 'Hide Comments' : 'Show Comments'}
    </motion.button>
  );
}

export default CommentButton;
