import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Lock } from 'lucide-react';
import { IconButton, Avatar } from '../components/ui';
import FollowButton from '../components/follow/FollowButton';
import { useAuth } from '../hooks/useAuth';
import { fetchConnections, fetchProfile } from '../services/profileService';
import { resolveImageUrl } from '../api';
import { arrowStep } from '../utils/direction';
import '../components/profile/ProfileTabs.css';
import './ConnectionsScreen.css';

// Day 37: /profile/:id/connections?tab=friends|followers|following -- a
// person's friends (people who follow each other), followers and following,
// A-Z, one page at a time. Public like profiles; a private account's lists
// are for its followers (the API answers 403, shown as an explanation).
const TABS = ['friends', 'followers', 'following'];

function ConnectionsScreen() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token, userId } = useAuth();
  const active = TABS.includes(params.get('tab')) ? params.get('tab') : 'friends';
  const tabRefs = useRef({});

  const [owner, setOwner] = useState(null);
  const [list, setList] = useState({ key: null, users: [], page: 1, hasMore: false, status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${id}:${active}`;

  useEffect(() => {
    let cancelled = false;
    fetchProfile(id, token).then((p) => { if (!cancelled) setOwner(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, token]);

  useEffect(() => {
    let cancelled = false;
    fetchConnections(id, active, token)
      .then((data) => { if (!cancelled) setList({ key, users: data.users, page: 1, hasMore: data.hasMore, status: 'ready' }); })
      .catch((err) => {
        if (cancelled) return;
        const status = err.response?.status === 403 ? 'private' : err.response?.status === 404 ? 'missing' : 'error';
        if (status === 'error') console.error(err);
        setList({ key, users: [], page: 1, hasMore: false, status });
      });
    return () => { cancelled = true; };
  }, [id, active, token, key]);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    fetchConnections(id, active, token, { page: list.page + 1 })
      .then((data) => setList((current) => (current.key !== key ? current : {
        ...current,
        users: [...current.users, ...data.users.filter((u) => !current.users.some((c) => c.id === u.id))],
        page: current.page + 1,
        hasMore: data.hasMore
      })))
      .catch((err) => console.error(err))
      .finally(() => setLoadingMore(false));
  }, [id, active, token, key, list.page]);

  const select = (tab) => {
    setParams({ tab }, { replace: true });
    tabRefs.current[tab]?.focus();
  };
  const handleKeyDown = (e, index) => {
    const step = arrowStep(e.key);
    let next = null;
    if (step) next = (index + step + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next !== null) {
      e.preventDefault();
      select(TABS[next]);
    }
  };

  const loading = list.key !== key;
  let panel;
  if (loading) {
    panel = <p className="connections-status" role="status">{t('common.loading')}</p>;
  } else if (list.status === 'private') {
    panel = (
      <div className="connections-status">
        <Lock size={22} aria-hidden="true" />
        <p>{t('connections.private', { name: owner?.username || '' })}</p>
      </div>
    );
  } else if (list.status === 'missing') {
    panel = <p className="connections-status">{t('profile.notFound')}</p>;
  } else if (list.status === 'error') {
    panel = <p className="connections-status" role="alert">{t('connections.loadFailed')}</p>;
  } else if (list.users.length === 0) {
    panel = <p className="connections-status">{t(`connections.empty.${active}`)}</p>;
  } else {
    panel = (
      <>
        <ul className="connections-list">
          {list.users.map((u) => (
            <li key={u.id} className="connections-row">
              <Link to={`/profile/${u.id}`} className="connections-person">
                <Avatar size={44} src={resolveImageUrl(u.avatar_url)} initials={u.username.slice(0, 2).toUpperCase()} alt="" />
                <span className="connections-name" dir="auto">{u.id === userId ? t('messages.you') : u.username}</span>
              </Link>
              {token && u.id !== userId && (
                <FollowButton
                  userId={u.id}
                  name={u.username}
                  token={token}
                  followsYou={u.follows_you}
                  initialState={u.is_following ? 'following' : u.request_pending ? 'pending' : 'none'}
                />
              )}
            </li>
          ))}
        </ul>
        {list.hasMore && (
          <button type="button" className="btn btn-secondary btn-block" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('common.loadMore')}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        <h1 className="screen-header-title">{owner?.username || ''}</h1>
      </header>
      <div role="tablist" aria-label={t('connections.sections')} className="profile-tablist connections-tablist">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            ref={(el) => { tabRefs.current[tab] = el; }}
            type="button"
            role="tab"
            id={`connections-tab-${tab}`}
            aria-selected={tab === active}
            aria-controls="connections-panel"
            tabIndex={tab === active ? 0 : -1}
            className={`profile-tab${tab === active ? ' is-active' : ''}`}
            onClick={() => select(tab)}
            onKeyDown={(e) => handleKeyDown(e, i)}
          >
            {t(`connections.tabs.${tab}`)}
          </button>
        ))}
      </div>
      <div id="connections-panel" role="tabpanel" aria-labelledby={`connections-tab-${active}`} className="screen-body">
        {panel}
      </div>
    </div>
  );
}

export default ConnectionsScreen;
