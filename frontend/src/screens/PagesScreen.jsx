import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Flag, Plus } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import { categoryLabel, fetchPages, followPage } from '../services/pageService';
import './GroupsScreen.css';

function PageRow({ page, token, onChanged }) {
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
          <span className="group-row-name">{page.name}</span>
          <span className="group-row-meta">
            {categoryLabel(page.category)} · {page.follower_count} {page.follower_count === 1 ? 'follower' : 'followers'}
          </span>
        </span>
      </Link>
      {!page.is_owner && !page.is_following && (
        <button type="button" className="btn btn-primary btn-sm" onClick={follow} disabled={busy} aria-label={`Follow ${page.name}`}>
          Follow
        </button>
      )}
    </li>
  );
}

function Section({ title, pages, empty, token, onChanged }) {
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
    </>
  );
}

// B14: /pages -- your pages, pages you follow, and pages to discover,
// with name search and a Create button.
function PagesScreen() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetchPages(token, query.trim())
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError('');
          }
        })
        .catch((err) => {
          console.error(err);
          if (!cancelled) setError('Could not load pages');
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token, query, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Menu" onClick={() => navigate('/menu')} />
        <h1 className="screen-header-title">Pages</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/pages/new')}>
          <Plus size={14} aria-hidden="true" /> Create
        </button>
      </header>
      <div className="screen-body">
        <label className="feed-visually-hidden" htmlFor="pages-search">Search pages</label>
        <input id="pages-search" type="search" className="form-input" placeholder="Search pages" value={query} onChange={(e) => setQuery(e.target.value)} />

        {error && <FeedErrorState message={error} onRetry={reload} />}
        {!data && !error && <p className="screen-status" role="status">Loading pages…</p>}
        {data && (
          <>
            {data.owned.length > 0 && <Section title="Your pages" pages={data.owned} token={token} onChanged={reload} empty="" />}
            <Section title="Following" pages={data.following} token={token} onChanged={reload} empty="You don't follow any pages yet." />
            <Section
              title="Discover"
              pages={data.discover}
              token={token}
              onChanged={reload}
              empty={query ? 'No pages match that search.' : 'No other pages yet. Create the first one!'}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default PagesScreen;
