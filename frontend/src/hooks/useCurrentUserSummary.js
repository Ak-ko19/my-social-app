import { useEffect, useState } from 'react';
import api, { resolveImageUrl } from '../api';
import { useAuth } from './useAuth';

// No display-name/handle/tagline/verified columns exist on `users` (only
// username, bio, avatar_url, ...) -- so the real profile is mapped honestly
// onto ProfileSummaryRow/PostComposer's shape: username stands in for both
// name and handle, bio (if any) for tagline, and verified is always false
// since no real field backs that badge. EMPTY_USER is the safe shape shown
// until GET /profile/me resolves.
export const EMPTY_USER = {
  name: '',
  handle: '',
  tagline: '',
  initials: '',
  bg: 'var(--color-subtle-bg)',
  color: 'var(--color-text)',
  verified: false,
  avatarUrl: undefined,
  isAdmin: false
};

// The logged-in user's summary for Menu/Settings/Home -- replaces the old
// data/mockCurrentUser.js placeholder, which showed a hardcoded fake person.
export function useCurrentUserSummary() {
  const { token } = useAuth();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (!token) return;
    api
      .get('/profile/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const profile = res.data;
        setCurrentUser({
          name: profile.username,
          handle: profile.username,
          tagline: profile.bio || '',
          initials: (profile.username || '?').slice(0, 2).toUpperCase(),
          // Solid accent, not the pale badge-indigo pair: this disc is 52px+
          // and read as a bright spot on the dark theme.
          bg: 'var(--color-accent)',
          color: '#fff',
          verified: false,
          avatarUrl: resolveImageUrl(profile.avatar_url),
          // B12: shows the Admin row in Settings (the API enforces it anyway).
          isAdmin: Boolean(profile.is_admin),
          // Day 105: the Finish-your-profile card's steps, and whether it
          // shows at all (after the first-run steps, until hidden).
          completion: {
            photo: Boolean(profile.avatar_url),
            cover: Boolean(profile.cover_url),
            bio: Boolean(profile.bio && profile.bio.trim()),
            links: Array.isArray(profile.links) && profile.links.length > 0,
            onboarded: Boolean(profile.onboarded_at),
            dismissed: Boolean(profile.profile_card_dismissed_at)
          }
        });
      })
      .catch((err) => console.error(err));
  }, [token]);

  return currentUser || EMPTY_USER;
}
