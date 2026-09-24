import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  LogOut,
  User,
  ShieldCheck,
  Bell,
  UserX,
  Globe,
  Moon,
  Lock,
  Eye,
  Users,
  SlidersHorizontal,
  Rss,
  Film,
  Video,
  Radio,
  UsersRound,
  Group,
  LifeBuoy,
  FileText,
  ScrollText,
  Info
} from 'lucide-react';
import { IconButton, SectionLabel, Badge } from '../components/ui';
import ProfileSummaryRow from '../components/layout/ProfileSummaryRow';
import AppFooter from '../components/layout/AppFooter';
import ThemeToggle from '../components/common/ThemeToggle';
import PrivacyToggle from '../components/common/PrivacyToggle';
import { useCurrentUserSummary } from '../hooks/useCurrentUserSummary';
import { forceLogout, useAuth } from '../hooks/useAuth';
import { useUnreadCount } from '../hooks/useUnreadCount';
import './SettingsScreen.css';

// Explicit icon imports + inline component refs, not a string name +
// dynamic-lookup map -- same lesson learned the hard way on MenuScreen
// (a computed property access on a namespace import defeats tree-shaking
// entirely and doubled that screen's bundle). Here there's no separate
// data file to keep swappable, so there's no need for the lookup-map
// layer at all: each row just holds its icon component directly.
const SETTINGS_SECTIONS = [
  {
    label: 'Account',
    rows: [
      { key: 'personal-info', icon: User, title: 'Personal Information', to: '/edit-profile' },
      { key: 'security', icon: ShieldCheck, title: 'Security & Privacy', to: '/settings/account' },
      // badgeCount isn't set here -- it's static config, but the
      // notifications count is live data, so it's injected at render
      // time below (the one row key this component special-cases).
      { key: 'notifications', icon: Bell, title: 'Notifications', to: '/notifications' },
      { key: 'blocked-users', icon: UserX, title: 'Blocked Users', to: '/settings/blocked-users' },
      { key: 'follow-requests', icon: Users, title: 'Follow Requests', to: '/settings/follow-requests' },
      { key: 'language-region', icon: Globe, title: 'Language & Region' },
      // Real, not "coming soon" -- wired to the real ThemeProvider/
      // ThemeToggle already built for this app, same as Personal
      // Information/Notifications above.
      { key: 'dark-mode', icon: Moon, title: 'Dark Mode', toggle: true }
    ]
  },
  {
    label: 'Social',
    rows: [
      { key: 'privacy-settings', icon: Lock, title: 'Private Account', toggle: true, ToggleComponent: PrivacyToggle },
      { key: 'content-visibility', icon: Eye, title: 'Who Can See My Content' },
      { key: 'followers-following', icon: Users, title: 'Followers & Following' },
      { key: 'content-preferences', icon: SlidersHorizontal, title: 'Content Preferences' }
    ]
  },
  {
    label: 'App Features',
    rows: [
      { key: 'news-feed-settings', icon: Rss, title: 'News Feed Settings' },
      { key: 'story-settings', icon: Film, title: 'Story Settings' },
      { key: 'reels-videos', icon: Video, title: 'Reels & Videos' },
      { key: 'live-streaming', icon: Radio, title: 'Live Streaming' },
      { key: 'communities', icon: UsersRound, title: 'Communities' },
      { key: 'groups', icon: Group, title: 'Groups' }
    ]
  },
  {
    label: 'Support & Legal',
    rows: [
      { key: 'help-support', icon: LifeBuoy, title: 'Help & Support' },
      { key: 'terms', icon: FileText, title: 'Terms & Conditions' },
      { key: 'privacy-policy', icon: ScrollText, title: 'Privacy Policy' },
      { key: 'about', icon: Info, title: 'About MySocialApp' }
    ]
  }
];

function SettingsScreen() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { unreadCount } = useUnreadCount(token);
  const currentUser = useCurrentUserSummary();

  return (
    <div className="screen-enter">
      <header className="settings-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Home" onClick={() => navigate('/')} />
        <h1 className="settings-header-title">Settings</h1>
        <IconButton icon={Search} aria-label="Search settings" disabled title="Coming soon" />
      </header>

      <div className="settings-profile-section">
        <ProfileSummaryRow user={currentUser} src={currentUser.avatarUrl} size={54} to="/edit-profile" />
      </div>

      {SETTINGS_SECTIONS.map((section) => (
        <section className="settings-section" key={section.label}>
          <SectionLabel className="settings-section-label">{section.label}</SectionLabel>

          {section.rows.map((row) => {
            const Icon = row.icon;
            const isEnabled = Boolean(row.to);
            // Notifications is the only row with a live count; every
            // other row's badgeCount (none currently) would come from
            // its own static config instead.
            const badgeCount = row.key === 'notifications' ? unreadCount : row.badgeCount;

            // A plain <div>, not a <button> like every other row -- the
            // ThemeToggle inside is already its own focusable
            // role="switch" button, and a button can't nest inside
            // another button (invalid HTML, and two overlapping tab
            // stops for one control).
            if (row.toggle) {
              const ToggleComponent = row.ToggleComponent || ThemeToggle;
              return (
                <div className="settings-row settings-row-static" key={row.key}>
                  <span className="settings-row-icon-badge">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span className="settings-row-label">{row.title}</span>
                  <span className="settings-theme-switch">
                    <ToggleComponent />
                  </span>
                </div>
              );
            }

            return (
              <button
                key={row.key}
                type="button"
                className="settings-row"
                onClick={isEnabled ? () => navigate(row.to) : undefined}
                disabled={!isEnabled}
                title={!isEnabled ? 'Coming soon' : undefined}
                aria-disabled={!isEnabled}
              >
                <span className="settings-row-icon-badge">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="settings-row-label">{row.title}</span>
                {typeof badgeCount === 'number' && badgeCount > 0 && (
                  <Badge
                    className="settings-row-badge"
                    bg="var(--color-accent-3)"
                    color="#fff"
                  >
                    {badgeCount}
                  </Badge>
                )}
                <ChevronRight size={18} className="settings-row-chevron" aria-hidden="true" />
              </button>
            );
          })}
        </section>
      ))}

      <div className="settings-logout-wrap">
        <button type="button" className="settings-logout-button" onClick={forceLogout}>
          <LogOut size={16} aria-hidden="true" />
          Log Out
        </button>
      </div>

      <AppFooter />
    </div>
  );
}

export default SettingsScreen;
