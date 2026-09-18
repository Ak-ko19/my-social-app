// Mirrors the CSS motion tokens from index.css (--duration-fast/normal/slow,
// --easing-standard/decelerate/accelerate) as plain JS values, since
// Motion's `transition` prop needs numbers (seconds) and easing arrays, not
// CSS var() references. Kept numerically identical to those tokens so
// CSS-driven and Motion-driven animations stay visually consistent.
export const DURATION_FAST = 0.12;
export const DURATION_NORMAL = 0.2;
export const DURATION_SLOW = 0.32;

export const EASE_STANDARD = [0.4, 0, 0.2, 1];
export const EASE_DECELERATE = [0, 0, 0.2, 1];
export const EASE_ACCELERATE = [0.4, 0, 1, 1];
