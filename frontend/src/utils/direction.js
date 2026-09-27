// B16: true while the app is laid out right-to-left (Arabic). <html dir> is
// set by src/i18n whenever the language changes.
export const isRtl = () => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

// Arrow keys follow what the user sees: in RTL, ArrowLeft moves "forward"
// (toward the end of a row) and ArrowRight moves back. Returns +1, -1 or 0.
export function arrowStep(key) {
  const forward = isRtl() ? 'ArrowLeft' : 'ArrowRight';
  const backward = isRtl() ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward) return 1;
  if (key === backward) return -1;
  return 0;
}
