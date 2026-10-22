import i18n from '../i18n';

// B8 / Day 78: why this person is suggested, in plain words
// (People you may know, and the first-run steps).
export function reasonText(s) {
  if (s.reason === 'follows_you') return i18n.t('explore.reason.followsYou');
  if (s.reason === 'popular') return s.follower_count ? i18n.t('explore.reason.popular', { count: s.follower_count }) : i18n.t('explore.reason.newHere');
  const [first, second] = s.mutual_sample || [];
  const others = s.mutual_count - (s.mutual_sample?.length || 0);
  if (!first) return i18n.t('explore.reason.mutual', { count: s.mutual_count });
  if (second && others <= 0) return i18n.t('explore.reason.followedByTwo', { first, second });
  if (others > 0) return i18n.t('explore.reason.followedByOthers', { first, count: others + (second ? 1 : 0) });
  return i18n.t('explore.reason.followedBy', { first });
}
