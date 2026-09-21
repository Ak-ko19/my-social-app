// Shared placeholder "current user" -- used by HomeFeed (Story row / post
// composer avatar) and MenuScreen (profile row), so the mocked person
// looks the SAME everywhere instead of each screen inventing its own.
// `handle`/`tagline`/`verified` have no real backing field anywhere in
// this app's schema (checked directly against the users table: id,
// username, email, password, created_at, bio, reset_token,
// reset_token_expiry, avatar_url, last_seen -- no handle/tagline/verified
// column). Unlike PostCard (real posts, real data), this is explicitly a
// presentational mock for a not-yet-built profile, so hardcoding these
// here -- rather than pretending they're real -- is the honest way to
// represent that.
const MOCK_CURRENT_USER = {
  name: 'Ko',
  handle: 'kukul',
  tagline: 'Build a better tomorrow',
  initials: 'KO',
  bg: 'var(--badge-indigo-bg)',
  color: 'var(--badge-indigo-fg)',
  verified: true
};

export default MOCK_CURRENT_USER;
