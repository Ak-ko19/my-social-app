import { motion, useReducedMotion } from 'motion/react';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { DURATION_FAST, EASE_STANDARD } from '../../utils/motionTokens';

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" />
        <line x1="18.4" y1="18.4" x2="19.8" y2="19.8" />
        <line x1="4.2" y1="19.8" x2="5.6" y2="18.4" />
        <line x1="18.4" y1="5.6" x2="19.8" y2="4.2" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" fill="currentColor" />
    </svg>
  );
}

// Generic, not Feed-specific -- lives in common/ alongside Avatar/
// ProgressiveImage. Currently only rendered from Feed.jsx's nav (the page
// this whole project is scoped to), but doesn't assume anything about where
// it's used.
//
// A real switch (track + sliding thumb, role="switch"/aria-checked) rather
// than a button whose label text swaps between "Light mode"/"Dark mode" --
// the sliding thumb's transform lives in Feed.css (.theme-switch[aria-
// checked='true'] .theme-switch-thumb), driven purely by the aria-checked
// attribute so it needs no extra local state here.
function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const isDark = theme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggleTheme}
      className="theme-switch"
      aria-label={nextTheme === 'dark' ? t('ui.switchToDark') : t('ui.switchToLight')}
      title={nextTheme === 'dark' ? t('ui.switchToDark') : t('ui.switchToLight')}
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
    >
      <span className="theme-switch-thumb">{isDark ? <MoonIcon /> : <SunIcon />}</span>
    </motion.button>
  );
}

export default ThemeToggle;
