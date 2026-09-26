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
// Search and Notifications open their screens (/search, /notifications).
// The bell used to be visual-only while the old Notifications page
// awaited the rebrand; A3 migrated that screen into PhoneShell, so B7
// wired the bell to it. Its aria-label includes the unread count.
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
      <IconButton
        icon={Bell}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        badgeCount={unreadCount}
        onClick={() => navigate('/notifications')}
      />
      <IconButton icon={SlidersHorizontal} aria-label="Open settings" onClick={() => navigate('/settings')} />
    </header>
  );
}

export default TopAppBar;
