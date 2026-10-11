import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bookmark,
  FilePen,
  UsersRound,
  CalendarDays, Flag,
  ChevronLeft,
  ChevronRight,
  Search,
  Newspaper,
  Briefcase,
  UserCircle,
  Wallet,
  MessageSquare,
  ShoppingBag,
  UtensilsCrossed,
  Car,
  Plane,
  Landmark,
  Building2,
  HeartPulse,
  GraduationCap,
  Clapperboard,
  Wrench,
  Sparkles,
  Code2,
  Star
} from 'lucide-react';
import { IconButton } from '../components/ui';
import ProfileSummaryRow from '../components/layout/ProfileSummaryRow';
import AppFooter from '../components/layout/AppFooter';
import SUPER_APP_CATEGORIES from '../data/superAppCategories';
import { useCurrentUserSummary } from '../hooks/useCurrentUserSummary';
import './MenuScreen.css';

// Explicit imports + map, not `import * as LucideIcons from 'lucide-react'`
// with a dynamic LucideIcons[name] lookup -- that was tried first and
// bundled the ENTIRE icon library (a dynamic/computed property access on a
// namespace import can't be statically analyzed by the bundler, so nothing
// can be tree-shaken out of it): the built JS jumped from ~555KB to
// 1.31MB, more than double, for one screen. This keeps the bundle only
// what's actually used, at one small cost to the data file's own promise:
// a category whose `icon` name isn't in this map yet needs one import +
// one map entry added here too, not just a new row in
// data/superAppCategories.js. Everything else about that promise still
// holds (title/subtitle/bg/fg/route all still "just edit the array").
const ICON_MAP = {
  Newspaper,
  Briefcase,
  UserCircle,
  Wallet,
  MessageSquare,
  ShoppingBag,
  UtensilsCrossed,
  Car,
  Plane,
  Landmark,
  Building2,
  HeartPulse,
  GraduationCap,
  Clapperboard,
  Wrench,
  Sparkles,
  Code2,
  Star
};

// Only Communication & Social Networking has a real destination -- this
// app's actual feed/messaging area, already fully built. Every other
// category is a real, disabled tap target (not a fake working screen) --
// none of those screens exist anywhere in this app yet. Adding a real
// destination for another category later means adding ONE entry here, not
// touching the render logic below.
const CATEGORY_ROUTES = {
  communication: '/messages'
};

function MenuScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const currentUser = useCurrentUserSummary();

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUPER_APP_CATEGORIES;
    return SUPER_APP_CATEGORIES.filter((category) => t(`menu.categories.${category.key}.title`).toLowerCase().includes(q));
  }, [query, t]);

  return (
    <div className="screen-enter">
      <header className="menu-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToHome')} onClick={() => navigate('/')} />
        <span className="menu-header-eyebrow">{t('menu.eyebrow')}</span>
        <ProfileSummaryRow
          user={currentUser}
          src={currentUser.avatarUrl}
          size={52}
          to="/settings"
        />
      </header>

      <div className="menu-search-bar">
        <Search size={16} aria-hidden="true" />
        <input
          type="text"
          className="menu-search-input"
          placeholder={t('menu.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('menu.searchLabel')}
        />
      </div>

      {/* A real quick-access shortcut, same pattern as Facebook's own
          hamburger menu -- separate from the SUPER_APP_CATEGORIES dream
          list below, which is a future-roadmap directory, not where an
          already-built feature like Saved Posts belongs. */}
      <div className="menu-category-list">
        <button type="button" className="menu-category-row" onClick={() => navigate('/saved')}>
          <span className="menu-category-icon-badge" style={{ background: 'var(--badge-indigo-bg)', color: 'var(--badge-indigo-fg)' }}>
            <Bookmark size={20} aria-hidden="true" />
          </span>
          <span className="menu-category-text">
            <span className="menu-category-title">{t('menu.saved')}</span>
            <span className="menu-category-subtitle">{t('menu.savedSub')}</span>
          </span>
          <ChevronRight size={18} className="menu-category-chevron" aria-hidden="true" />
        </button>
        {/* Day 45 */}
        <button type="button" className="menu-category-row" onClick={() => navigate('/drafts')}>
          <span className="menu-category-icon-badge" style={{ background: 'var(--badge-purple-bg)', color: 'var(--badge-purple-fg)' }}>
            <FilePen size={20} aria-hidden="true" />
          </span>
          <span className="menu-category-text">
            <span className="menu-category-title">{t('menu.drafts')}</span>
            <span className="menu-category-subtitle">{t('menu.draftsSub')}</span>
          </span>
          <ChevronRight size={18} className="menu-category-chevron" aria-hidden="true" />
        </button>
        <button type="button" className="menu-category-row" onClick={() => navigate('/groups')}>
          <span className="menu-category-icon-badge" style={{ background: 'var(--badge-teal-bg)', color: 'var(--badge-teal-fg)' }}>
            <UsersRound size={20} aria-hidden="true" />
          </span>
          <span className="menu-category-text">
            <span className="menu-category-title">{t('menu.groups')}</span>
            <span className="menu-category-subtitle">{t('menu.groupsSub')}</span>
          </span>
          <ChevronRight size={18} className="menu-category-chevron" aria-hidden="true" />
        </button>
        <button type="button" className="menu-category-row" onClick={() => navigate('/pages')}>
          <span className="menu-category-icon-badge" style={{ background: 'var(--badge-orange-bg)', color: 'var(--badge-orange-fg)' }}>
            <Flag size={20} aria-hidden="true" />
          </span>
          <span className="menu-category-text">
            <span className="menu-category-title">{t('menu.pages')}</span>
            <span className="menu-category-subtitle">{t('menu.pagesSub')}</span>
          </span>
          <ChevronRight size={18} className="menu-category-chevron" aria-hidden="true" />
        </button>
        {/* Day 55. */}
        <button type="button" className="menu-category-row" onClick={() => navigate('/events')}>
          <span className="menu-category-icon-badge" style={{ background: 'var(--badge-red-bg)', color: 'var(--badge-red-fg)' }}>
            <CalendarDays size={20} aria-hidden="true" />
          </span>
          <span className="menu-category-text">
            <span className="menu-category-title">{t('menu.events')}</span>
            <span className="menu-category-subtitle">{t('menu.eventsSub')}</span>
          </span>
          <ChevronRight size={18} className="menu-category-chevron" aria-hidden="true" />
        </button>
      </div>

      <div className="menu-category-list">
        {filteredCategories.map((category) => {
          const Icon = ICON_MAP[category.icon];
          const path = CATEGORY_ROUTES[category.key];
          const isEnabled = Boolean(path);

          return (
            <button
              key={category.key}
              type="button"
              className="menu-category-row"
              onClick={isEnabled ? () => navigate(path) : undefined}
              disabled={!isEnabled}
              title={!isEnabled ? t('common.comingSoon') : undefined}
              aria-disabled={!isEnabled}
            >
              <span
                className="menu-category-icon-badge"
                style={{ background: category.bg, color: category.fg }}
              >
                {Icon && <Icon size={20} aria-hidden="true" />}
              </span>
              <span className="menu-category-text">
                <span className="menu-category-title">{t(`menu.categories.${category.key}.title`)}</span>
                <span className="menu-category-subtitle">{t(`menu.categories.${category.key}.subtitle`)}</span>
              </span>
              <ChevronRight size={18} className="menu-category-chevron" aria-hidden="true" />
            </button>
          );
        })}

        {filteredCategories.length === 0 && <p className="menu-empty-state">{t('menu.noMatch', { query })}</p>}
      </div>

      <AppFooter />
    </div>
  );
}

export default MenuScreen;
