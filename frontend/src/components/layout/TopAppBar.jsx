import { useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, SlidersHorizontal } from 'lucide-react';
import { IconButton } from '../ui';
import Logo from './Logo';
import { useAuth } from '../../hooks/useAuth';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import './layout.css';

// Home screen's header only (see screens/HomeFeed.jsx) -- Menu/Settings
// each have their own back-button header instead, not this.
//
// Notifications is visual-only for now (aria-label only, no onClick) --
// where it should go isn't decided yet (this app already has a working
// /notifications screen from before this rebrand, but Home/Menu/Settings
// are getting fresh screens rather than reusing the old ones as-is, so
// wiring it to the old route isn't necessarily right -- left for whoever
// builds that screen next to decide). Search was wired to the existing
// /search route since it's just navigation, not a rebrand decision.
function TopAppBar({ className }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { unreadCount } = useUnreadCount(token);

  return (
    <header className={className ? `top-app-bar ${className}` : 'top-app-bar'}>
      <IconButton icon={Menu} aria-label="Open menu" onClick={() => navigate('/menu')} />
      <Logo />
      <span className="top-app-bar-spacer" />
      <IconButton icon={Search} aria-label="Search" onClick={() => navigate('/search')} />
      <IconButton icon={Bell} aria-label="Notifications" badgeCount={unreadCount} />
      <IconButton icon={SlidersHorizontal} aria-label="Open settings" onClick={() => navigate('/settings')} />
    </header>
  );
}

export default TopAppBar;
