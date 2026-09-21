import { useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, SlidersHorizontal } from 'lucide-react';
import { IconButton } from '../ui';
import Logo from './Logo';
import './layout.css';

// Home screen's header only (see screens/HomeFeed.jsx) -- Menu/Settings
// each have their own back-button header instead, not this.
//
// Search/Notifications are visual-only for now (aria-label only, no
// onClick) -- only Menu -> /menu and Settings -> /settings were asked to
// navigate anywhere; where Search/Notifications should go isn't decided
// yet (this app already has working /search and /notifications screens
// from before this rebrand, but Home/Menu/Settings are getting fresh
// screens rather than reusing the old ones as-is, so wiring these to the
// old routes isn't necessarily right -- left for whoever builds those
// screens next to decide).
function TopAppBar({ className }) {
  const navigate = useNavigate();

  return (
    <header className={className ? `top-app-bar ${className}` : 'top-app-bar'}>
      <IconButton icon={Menu} aria-label="Open menu" onClick={() => navigate('/menu')} />
      <Logo />
      <span className="top-app-bar-spacer" />
      <IconButton icon={Search} aria-label="Search" />
      <IconButton icon={Bell} aria-label="Notifications" badgeCount={3} />
      <IconButton icon={SlidersHorizontal} aria-label="Open settings" onClick={() => navigate('/settings')} />
    </header>
  );
}

export default TopAppBar;
