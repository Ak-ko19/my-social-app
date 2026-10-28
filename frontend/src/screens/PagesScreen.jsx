import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Flag, Plus } from 'lucide-react';
import { IconButton, NameWithTick } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import { categoryLabel, fetchPages, followPage } from '../services/pageService';
import './GroupsScreen.css';

function PageRow({ page, token, onChanged }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const follow = () => {
    setBusy(true);
    followPage(page.id, token)
      .then(onChanged)
      .catch((err) => console.error(err))
      .finally(() => setBusy(false));
  };
  return (
    <li className="group-row">
      <Link to={`/pages/${page.id}`} className="group-row-link">
        <span className="group-row-icon page-icon" aria-hidden="true">
          <Flag size={20} />
        </span>
        <span className="group-row-text">
          <NameWithTick className="group-row-name" name={page.name} verified={page.is_verified} tickSize={15} />
          <span className="group-row-meta">
            {categoryLabel(page.category)} · {t('pages.followerCount', { count: page.follower_count })}
          </span>
        </span>
      </Link>
      {!page.is_admin && !page.is_following && (
        <button type="button" className="btn btn-primary btn-sm" onClick={follow} disabled={busy} aria-label={t('pages.followName', { name: page.name })}>
          {t('follow.follow')}
        </button>
      )}
    </li>
  );
}

function Section({ title, pages, empty, token, onChanged, more }) {
  return (
    <>
      <h2 className="section-heading">{title}</h2>
      {pages.length === 0 ? (
        <p className="screen-status">{empty}</p>
      ) : (
        <ul className="group-list">
          {pages.map((p) => <PageRow key={p.id} page={p} token={token} onChanged={onChanged} />)}
        </ul>
      )}
      {more}
    </>
  );
}

// B14: /pages -- your pages, pages you follow, and pages to discover,
// with name search and a Create button.
function PagesScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  // Day 53: each section pages on its own -- the last page loaded of each.
  const [pages, setPages] = useState({ owned: 1, following: 1, discover: 1 });
  const [moreError, setMoreError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchPages(token, query.trim())
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setPages({ owned: 1, following: 1, discover: 1 });
            setError('');
            setMoreError('');
          }
        })
        .catch((err) => {
          console.error(err);
          if (!cancelled) setError(t('pages.loadFailed'));
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, query, reloadKey, t]);

  const reload = () => setReloadKey((k) => k + 1);
  const more = (section) => {
    setMoreError('');
    fetchPages(token, query.trim(), { section, page: pages[section] + 1 })
      .then((next) => {
        setData((d) => ({ ...d, [section]: [...d[section], ...next.pages], [section + 'HasMore']: next.hasMore }));
        setPages((p) => ({ ...p, [section]: p[section] + 1 }));
      })
      .catch((err) => {
        console.error(err);
        setMoreError(t('pages.loadFailed'));
      });
  };
  const loadMore = (section) => data[section + 'HasMore'] && (
    <button type="button" className="btn btn-secondary btn-block" onClick={() => more(section)}>{t('common.loadMore')}</button>
  );

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToMenu')} onClick={() => navigate('/menu')} />
        <h1 className="screen-header-title">{t('pages.title')}</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/pages/new')}>
          <Plus size={14} aria-hidden="true" /> {t('common.create')}
        </button>
      </header>
      <div className="screen-body">
        <label className="feed-visually-hidden" htmlFor="pages-search">{t('pages.search')}</label>
        <input id="pages-search" type="search" className="form-input" placeholder={t('pages.search')} value={query} onChange={(e) => setQuery(e.target.value)} />

        {error && <FeedErrorState message={error} onRetry={reload} />}
        {!data && !error && <p className="screen-status" role="status">{t('pages.loading')}</p>}
        {data && (
          <>
            {data.owned.length > 0 && <Section title={t('pages.yours')} pages={data.owned} token={token} onChanged={reload} empty="" more={loadMore('owned')} />}
            <Section title={t('pages.following')} pages={data.following} token={token} onChanged={reload} empty={t('pages.notFollowing')} more={loadMore('following')} />
            <Section
              title={t('pages.discover')}
              pages={data.discover}
              token={token}
              onChanged={reload}
              empty={query ? t('pages.noMatch') : t('pages.noneYet')}
              more={loadMore('discover')}
            />
            {moreError && <p className="form-error" role="alert">{moreError}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default PagesScreen;
