import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark,
  UsersRound,
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
  const [query, setQuery] = useState('');
  const currentUser = useCurrentUserSummary();

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUPER_APP_CATEGORIES;
    return SUPER_APP_CATEGORIES.filter((category) => category.title.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="screen-enter">
      <header className="menu-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Home" onClick={() => navigate('/')} />
        <span className="menu-header-eyebrow">Explore MySocialApp</span>
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
          placeholder="Search features…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search features"
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
            <span className="menu-category-title">Saved Posts</span>
            <span className="menu-category-subtitle">Posts you've bookmarked</span>
          </span>
          <ChevronRight size={18} className="menu-category-chevron" aria-hidden="true" />
        </button>
        <button type="button" className="menu-category-row" onClick={() => navigate('/groups')}>
          <span className="menu-category-icon-badge" style={{ background: 'var(--badge-teal-bg)', color: 'var(--badge-teal-fg)' }}>
            <UsersRound size={20} aria-hidden="true" />
          </span>
          <span className="menu-category-text">
            <span className="menu-category-title">Groups</span>
            <span className="menu-category-subtitle">Communities you've joined or can discover</span>
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
              title={!isEnabled ? 'Coming soon' : undefined}
              aria-disabled={!isEnabled}
            >
              <span
                className="menu-category-icon-badge"
                style={{ background: category.bg, color: category.fg }}
              >
                {Icon && <Icon size={20} aria-hidden="true" />}
              </span>
              <span className="menu-category-text">
                <span className="menu-category-title">{category.title}</span>
                <span className="menu-category-subtitle">{category.subtitle}</span>
              </span>
              <ChevronRight size={18} className="menu-category-chevron" aria-hidden="true" />
            </button>
          );
        })}

        {filteredCategories.length === 0 && <p className="menu-empty-state">No features match “{query}”.</p>}
      </div>

      <AppFooter />
    </div>
  );
}

export default MenuScreen;
