import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Globe, Lock, Plus, UsersRound } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import { fetchCommunities, joinCommunity } from '../services/communityService';
import './GroupsScreen.css';

function GroupRow({ group, token, onJoined }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const status = group.my_status;
  const join = () => {
    setBusy(true);
    joinCommunity(group.id, token)
      .then(onJoined)
      .catch((err) => console.error(err))
      .finally(() => setBusy(false));
  };
  return (
    <li className="group-row">
      <Link to={`/groups/${group.id}`} className="group-row-link">
        <span className="group-row-icon" aria-hidden="true">
          <UsersRound size={22} />
        </span>
        <span className="group-row-text">
          <span className="group-row-name">{group.name}</span>
          <span className="group-row-meta">
            {group.privacy === 'private' ? <Lock size={12} aria-hidden="true" /> : <Globe size={12} aria-hidden="true" />}
            {' '}{group.privacy === 'private' ? t('groups.private') : t('groups.public')} · {t('groups.memberCount', { count: group.member_count })}
            {status === 'pending' && ` · ${t('groups.requested')}`}
            {group.my_role === 'admin' && status === 'member' && ` · ${t('groups.admin')}`}
          </span>
        </span>
      </Link>
      {!status && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={join}
          disabled={busy}
          aria-label={group.privacy === 'private' ? t('groups.requestName', { name: group.name }) : t('groups.joinName', { name: group.name })}
        >
          {group.privacy === 'private' ? t('groups.request') : t('groups.join')}
        </button>
      )}
    </li>
  );
}

// B13: /groups -- your groups (incl. pending requests) + groups to discover,
// with name search and a Create button.
function GroupsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  // Day 50: each section pages on its own -- the last page loaded of each.
  const [pages, setPages] = useState({ mine: 1, discover: 1 });
  const [moreError, setMoreError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Debounced so typing in the search box doesn't fire a request per key.
    const timer = setTimeout(() => {
      fetchCommunities(token, query.trim())
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setPages({ mine: 1, discover: 1 });
            setError('');
            setMoreError('');
          }
        })
        .catch((err) => {
          console.error(err);
          if (!cancelled) setError(t('groups.loadFailed'));
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
    fetchCommunities(token, query.trim(), { section, page: pages[section] + 1 })
      .then((next) => {
        setData((d) => ({ ...d, [section]: [...d[section], ...next.groups], [`${section}HasMore`]: next.hasMore }));
        setPages((p) => ({ ...p, [section]: p[section] + 1 }));
      })
      .catch((err) => {
        console.error(err);
        setMoreError(t('groups.loadFailed'));
      });
  };
  const loadMore = (section) => data[`${section}HasMore`] && (
    <button type="button" className="btn btn-secondary btn-block" onClick={() => more(section)}>{t('common.loadMore')}</button>
  );

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToMenu')} onClick={() => navigate('/menu')} />
        <h1 className="screen-header-title">{t('groups.title')}</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/groups/new')}>
          <Plus size={14} aria-hidden="true" /> {t('common.create')}
        </button>
      </header>
      <div className="screen-body">
        <label className="feed-visually-hidden" htmlFor="groups-search">{t('groups.search')}</label>
        <input id="groups-search" type="search" className="form-input" placeholder={t('groups.search')} value={query} onChange={(e) => setQuery(e.target.value)} />

        {error && <FeedErrorState message={error} onRetry={reload} />}
        {!data && !error && <p className="screen-status" role="status">{t('groups.loading')}</p>}
        {data && (
          <>
            <h2 className="section-heading">{t('groups.yourGroups')}</h2>
            {data.mine.length === 0 ? (
              <p className="screen-status">{t('groups.notJoined')}</p>
            ) : (
              <ul className="group-list">
                {data.mine.map((g) => <GroupRow key={g.id} group={g} token={token} onJoined={reload} />)}
              </ul>
            )}
            {loadMore('mine')}
            <h2 className="section-heading">{t('groups.discover')}</h2>
            {data.discover.length === 0 ? (
              <p className="screen-status">{query ? t('groups.noMatch') : t('groups.noneYet')}</p>
            ) : (
              <ul className="group-list">
                {data.discover.map((g) => <GroupRow key={g.id} group={g} token={token} onJoined={reload} />)}
              </ul>
            )}
            {loadMore('discover')}
            {moreError && <p className="form-error" role="alert">{moreError}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default GroupsScreen;
