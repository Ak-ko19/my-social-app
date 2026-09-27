import i18n from '../i18n';

const UNITS = [
  ['y', 31536000],
  ['mo', 2592000],
  ['w', 604800],
  ['d', 86400],
  ['h', 3600],
  ['m', 60]
];

// Short relative timestamps ("5m ago", "3h ago") for compact list rows --
// intentionally terser than Intl.RelativeTimeFormat's "5 minutes ago",
// which doesn't fit a conversation preview row.
export function formatRelativeTime(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return i18n.t('time.justNow');

  for (const [abbr, secondsInUnit] of UNITS) {
    const value = Math.floor(seconds / secondsInUnit);
    if (value >= 1) return i18n.t(`time.${abbr}`, { count: value });
  }
  return i18n.t('time.justNow');
}
