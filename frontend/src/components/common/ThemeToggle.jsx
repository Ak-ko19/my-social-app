import { motion, useReducedMotion } from 'motion/react';
import { useTheme } from '../../hooks/useTheme';
import { DURATION_FAST, EASE_STANDARD } from '../../utils/motionTokens';

// Generic, not Feed-specific -- lives in common/ alongside Avatar/
// ProgressiveImage. Currently only rendered from Feed.jsx's nav (the page
// this whole project is scoped to), but doesn't assume anything about where
// it's used.
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      className="feed-btn feed-btn-secondary"
      aria-label={`Switch to ${nextTheme} theme`}
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
    >
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </motion.button>
  );
}

export default ThemeToggle;
