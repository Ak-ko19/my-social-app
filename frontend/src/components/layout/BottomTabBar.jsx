import { useLocation, useNavigate } from 'react-router-dom';
import { Home, PlayCircle, Zap, MessageSquare, User } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import './layout.css';

// Videos/Shorts have no real destination -- neither screen exists anywhere
// in this app -- so `path: null` here means "render it, but disabled/
// coming-soon", same treatment as Video/Live in PostComposer.jsx and Share
// in PostCard.jsx, rather than inventing a route to a screen that isn't
// built. Messages goes to the real, already-working /messages inbox
// (nothing new-system exists for it yet); Profile -> /settings is explicit
// in the spec.
const TABS = [
  { key: 'home', label: 'Home', icon: Home, path: '/' },
  { key: 'videos', label: 'Videos', icon: PlayCircle, path: null },
  { key: 'shorts', label: 'Shorts', icon: Zap, path: null },
  { key: 'messages', label: 'Messages', icon: MessageSquare, path: '/messages' },
  { key: 'profile', label: 'Profile', icon: User, path: '/settings' }
];

// The "existing unread-DM-count logic" is useConversations' own per-
// conversation `unread_count` (real data from GET /conversations, already
// used by ConversationListItem's own per-row badge) -- there's no single
// pre-aggregated "total unread DMs" number anywhere yet, so this sums the
// real per-conversation counts rather than adding a new backend endpoint
// for one. Mounted here (inside PhoneShell, so it persists across Home/
// Menu/Settings per the task) means this stays live/subscribed via the
// same socket the hook already listens on, the whole time the user is
// anywhere in this nav shell -- not just while actually on /messages.
function BottomTabBar({ className }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, userId } = useAuth();
  const { conversations } = useConversations(token, userId);
  const unreadMessages = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return (
    <nav className={className ? `bottom-tab-bar ${className}` : 'bottom-tab-bar'} aria-label="Primary">
      {TABS.map(({ key, label, icon: Icon, path }) => {
        const isActive = path === location.pathname;
        const badgeCount = key === 'messages' ? unreadMessages : 0;

        return (
          <button
            key={key}
            type="button"
            className={clsx('bottom-tab', isActive && 'bottom-tab-active')}
            onClick={path ? () => navigate(path) : undefined}
            disabled={!path}
            title={!path ? 'Coming soon' : undefined}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="bottom-tab-icon-wrap">
              <Icon size={20} aria-hidden="true" />
              {badgeCount > 0 && (
                <span className="bottom-tab-badge" aria-hidden="true">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
            </span>
            <span className="bottom-tab-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomTabBar;
