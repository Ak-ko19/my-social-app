import { Suspense } from 'react';
import clsx from 'clsx';
import BottomTabBar from './BottomTabBar';
import './layout.css';

// Constrains content to a centered mobile-width column, even on a wide
// desktop browser -- this app's screens are mobile-first. Every route is
// wrapped in it as of A3 (the old pre-rebrand pages were migrated onto the
// shared styles/screens.css classes first, so they fit the 480px column).
// See App.jsx for where this is applied.
//
// BottomTabBar is mounted here (not per-screen) specifically so it
// persists identically across Home/Menu/Settings, and so its own
// unread-message subscription (see BottomTabBar.jsx) stays live the whole
// time the user is anywhere in this nav shell, not just re-created fresh
// on every screen.
//
// hideTabBar: for screens where primary navigation doesn't belong -- the
// logged-out auth forms, and a chat thread whose composer owns the bottom
// edge (same as every mainstream messaging app).
function PhoneShell({ children, className, hideTabBar = false }) {
  return (
    <div className={clsx('phone-shell', className)}>
      {/* Screens are lazy-loaded (App.jsx) -- this fallback only shows on the
          first visit to a screen, while its chunk downloads. */}
      <Suspense fallback={<p className="screen-status" role="status">Loading…</p>}>{children}</Suspense>
      {!hideTabBar && <BottomTabBar />}
    </div>
  );
}

export default PhoneShell;
