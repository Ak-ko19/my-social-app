// Day 37: the i18n key for a follow button's label. "Follow back" when the
// person already follows you (following them then makes you friends).
export function followLabelKey(state, followsYou) {
  if (state === 'following') return 'follow.following';
  if (state === 'pending') return 'follow.requested';
  return followsYou ? 'follow.followBack' : 'follow.follow';
}
