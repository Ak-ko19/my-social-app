import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  LogOut,
  User,
  ShieldCheck,
  ShieldAlert,
  Bell,
  BellRing,
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
// B12: only admins see this section (the /admin API enforces it anyway).
const ADMIN_SECTION = {
  id: 'admin',
  rows: [{ key: 'moderation', icon: ShieldAlert, to: '/admin' }]
};

const SETTINGS_SECTIONS = [
  {
    id: 'account',
    rows: [
      { key: 'personal-info', icon: User, to: '/edit-profile' },
      { key: 'security', icon: ShieldCheck, to: '/settings/account' },
      // badgeCount isn't set here -- it's static config, but the
      // notifications count is live data, so it's injected at render
      // time below (the one row key this component special-cases).
      { key: 'notifications', icon: Bell, to: '/notifications' },
      // B11: choose which notifications to receive.
      { key: 'notification-settings', icon: BellRing, to: '/settings/notifications' },
      { key: 'blocked-users', icon: UserX, to: '/settings/blocked-users' },
      { key: 'follow-requests', icon: Users, to: '/settings/follow-requests' },
      // B15: English / Myanmar.
      { key: 'language', icon: Globe, to: '/settings/language' },
      // Real, not "coming soon" -- wired to the real ThemeProvider/
      // ThemeToggle already built for this app, same as Personal
      // Information/Notifications above.
      { key: 'dark-mode', icon: Moon, toggle: true }
    ]
  },
  {
    id: 'social',
    rows: [
      { key: 'privacy-settings', icon: Lock, toggle: true, ToggleComponent: PrivacyToggle },
      { key: 'content-visibility', icon: Eye },
      { key: 'followers-following', icon: Users },
      { key: 'content-preferences', icon: SlidersHorizontal }
    ]
  },
  {
    id: 'features',
    rows: [
      { key: 'news-feed-settings', icon: Rss },
      { key: 'story-settings', icon: Film },
      { key: 'reels-videos', icon: Video },
      { key: 'live-streaming', icon: Radio },
      { key: 'pages', icon: UsersRound, to: '/pages' },
      { key: 'groups', icon: Group, to: '/groups' }
    ]
  },
  {
    id: 'support',
    rows: [
      { key: 'help-support', icon: LifeBuoy },
      { key: 'terms', icon: FileText },
      { key: 'privacy-policy', icon: ScrollText },
      { key: 'about', icon: Info }
    ]
  }
];

function SettingsScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { token, userId } = useAuth();
  const languageLabel = LANGUAGES.find((l) => l.code === i18n.language)?.label;
  const { unreadCount } = useUnreadCount(token);
  const currentUser = useCurrentUserSummary();

  return (
    <div className="screen-enter">
      <header className="settings-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToHome')} onClick={() => navigate('/')} />
        <h1 className="settings-header-title">{t('settings.title')}</h1>
        <IconButton icon={Search} aria-label={t('settings.searchSettings')} disabled title={t('common.comingSoon')} />
      </header>

      <div className="settings-profile-section">
        {/* Opens your own profile (B6 tabs live there; it has its own Edit
            Profile button, and "Personal Information" below still goes
            straight to the edit form). */}
        <ProfileSummaryRow user={currentUser} src={currentUser.avatarUrl} size={54} to={userId ? `/profile/${userId}` : "/edit-profile"} />
      </div>

      {(currentUser.isAdmin ? [ADMIN_SECTION, ...SETTINGS_SECTIONS] : SETTINGS_SECTIONS).map((section) => (
        <section className="settings-section" key={section.id}>
          <SectionLabel className="settings-section-label">{t(`settings.sections.${section.id}`)}</SectionLabel>

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
                  <span className="settings-row-label">{t(`settings.rows.${row.key}`)}</span>
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
                title={!isEnabled ? t('common.comingSoon') : undefined}
                aria-disabled={!isEnabled}
              >
                <span className="settings-row-icon-badge">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="settings-row-label">{t(`settings.rows.${row.key}`)}</span>
                {row.key === 'language' && <span className="settings-row-value">{languageLabel}</span>}
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
          {t('settings.logOut')}
        </button>
      </div>

      <AppFooter />
    </div>
  );
}

export default SettingsScreen;
