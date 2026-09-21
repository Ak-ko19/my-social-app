import clsx from 'clsx';
import BottomTabBar from './BottomTabBar';
import './layout.css';

// Constrains content to a centered mobile-width column, even on a wide
// desktop browser -- this app's new screens are mobile-first. Deliberately
// wraps only the NEW route tree (Home/Menu/Settings), not the existing
// screens (Feed/Messages/...): those assume the old #root's 1126px column
// (FeedList's virtualizer, chat bubble widths, etc. are all sized against
// it) and would visibly break, not just "look different," if force-fit
// into 480px before being migrated. See App.jsx for where this is applied.
//
// BottomTabBar is mounted here (not per-screen) specifically so it
// persists identically across Home/Menu/Settings, and so its own
// unread-message subscription (see BottomTabBar.jsx) stays live the whole
// time the user is anywhere in this nav shell, not just re-created fresh
// on every screen.
function PhoneShell({ children, className }) {
  return (
    <div className={clsx('phone-shell', className)}>
      {children}
      <BottomTabBar />
    </div>
  );
}

export default PhoneShell;
