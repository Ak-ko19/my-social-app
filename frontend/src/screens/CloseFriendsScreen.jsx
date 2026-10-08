import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Avatar } from '../components/ui';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { resolveImageUrl } from '../api';
import { serverErrorText } from '../utils/serverError';
import {
  fetchCloseFriends, fetchCloseFriendCandidates, addCloseFriend, removeCloseFriend
} from '../services/closeFriendsService';
import './BlockedUsersScreen.css';
import './CloseFriendsScreen.css';

const initials = (name) => (name || '?').slice(0, 2).toUpperCase();

// Day 47: Settings -> Close friends (Instagram's). Your list, and the
// people who follow you to add. Only you see the list; nobody is told.
function CloseFriendsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [friends, setFriends] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('loading'); // loading | error | ready
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    fetchCloseFriends(token)
      .then((data) => {
        setFriends(data.closeFriends);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Followers to add, filtered as you type (a short pause first).
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCloseFriendCandidates(token, query.trim())
        .then((data) => setCandidates(data.candidates))
        .catch(() => setCandidates([]));
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [token, query, friends.length]);

  const retry = () => {
    setState('loading');
    load();
  };

  const run = async (userId, work) => {
    if (busyId) return;
    setBusyId(userId);
    setActionError('');
    try {
      await work();
    } catch (err) {
      setActionError(serverErrorText(err, 'closeFriends.failed'));
    } finally {
      setBusyId(null);
    }
  };
  const add = (user) => run(user.id, async () => {
    await addCloseFriend(user.id, token);
    setFriends((list) => [user, ...list]);
    setCandidates((list) => list.filter((u) => u.id !== user.id));
  });
  const remove = (user) => run(user.id, async () => {
    await removeCloseFriend(user.id, token);
    setFriends((list) => list.filter((u) => u.id !== user.id));
  });

  const row = (user, action) => (
    <li key={user.id} className="blocked-users-row">
      <Avatar size={40} src={resolveImageUrl(user.avatar_url)} initials={initials(user.username)} alt="" />
      <span className="blocked-users-name">{user.username}</span>
      {action}
    </li>
  );

  return (
    <div className="screen-enter">
      <header className="blocked-users-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="blocked-users-header-title">{t('closeFriends.title')}</h1>
      </header>
      <p className="close-friends-intro">
        <Star size={16} aria-hidden="true" className="close-friends-star" /> {t('closeFriends.explain')}
      </p>

      {state === 'loading' && <p className="blocked-users-status" role="status">{t('common.loading')}</p>}
      {state === 'error' && <FeedErrorState message={t('closeFriends.loadFailed')} onRetry={retry} />}
      {actionError && <p className="blocked-users-status" role="alert">{actionError}</p>}

      {state === 'ready' && (
        <>
          <section aria-labelledby="close-friends-list">
            <h2 id="close-friends-list" className="close-friends-heading">{t('closeFriends.onList', { count: friends.length })}</h2>
            {friends.length === 0 && <p className="blocked-users-status">{t('closeFriends.empty')}</p>}
            <ul className="blocked-users-list">
              {friends.map((user) => row(user, (
                <button type="button" className="blocked-users-unblock-btn" onClick={() => remove(user)} disabled={busyId === user.id}
                  aria-label={t('closeFriends.removeName', { name: user.username })}>
                  {t('closeFriends.remove')}
                </button>
              )))}
            </ul>
          </section>

          <section aria-labelledby="close-friends-add">
            <h2 id="close-friends-add" className="close-friends-heading">{t('closeFriends.addHeading')}</h2>
            <label className="close-friends-search">
              <Search size={16} aria-hidden="true" />
              <span className="feed-visually-hidden">{t('closeFriends.searchLabel')}</span>
              <input type="search" className="form-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('closeFriends.searchPlaceholder')} dir="auto" />
            </label>
            {candidates.length === 0 && (
              <p className="blocked-users-status">{query.trim() ? t('closeFriends.noMatch') : t('closeFriends.noFollowers')}</p>
            )}
            <ul className="blocked-users-list">
              {candidates.map((user) => row(user, (
                <button type="button" className="blocked-users-unblock-btn close-friends-add-btn" onClick={() => add(user)} disabled={busyId === user.id}
                  aria-label={t('closeFriends.addName', { name: user.username })}>
                  {t('closeFriends.add')}
                </button>
              )))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default CloseFriendsScreen;
