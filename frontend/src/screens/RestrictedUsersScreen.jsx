import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { fetchRestrictedUsers, unrestrictUser } from '../services/restrictService';
import { resolveImageUrl } from '../api';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useTranslation } from 'react-i18next';
import './BlockedUsersScreen.css';
import '../components/feed/Feed.css';

// Day 47: Settings -> Restricted accounts. Same layout as Blocked users
// (its CSS).
function RestrictedUsersScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [restrictedUsers, setRestrictedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unrestrictingId, setUnrestrictingId] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    fetchRestrictedUsers(token)
      .then((data) => setRestrictedUsers(data.restrictedUsers))
      .catch((err) => {
        console.error(err);
        setError(t('restricted.loadFailed'));
      })
      .finally(() => setLoading(false));
  }, [token, t]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const handleUnrestrict = (userId) => {
    setUnrestrictingId(userId);
    setActionError('');
    unrestrictUser(userId, token)
      .then(() => setRestrictedUsers((current) => current.filter((u) => u.id !== userId)))
      .catch((err) => {
        console.error(err);
        setActionError(t('restricted.unrestrictFailed'));
      })
      .finally(() => setUnrestrictingId(null));
  };

  return (
    <div className="screen-enter">
      <header className="blocked-users-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="blocked-users-header-title">{t('restricted.title')}</h1>
      </header>

      {loading && <p className="blocked-users-status">{t('common.loading')}</p>}
      {!loading && error && <FeedErrorState message={error} onRetry={retry} />}
      {actionError && <p className="blocked-users-status" role="alert">{actionError}</p>}
      {!loading && !error && (
        <p className="blocked-users-status">{restrictedUsers.length === 0 ? t('restricted.empty') : t('restricted.explain')}</p>
      )}

      <ul className="blocked-users-list">
        {restrictedUsers.map((user) => (
          <li key={user.id} className="blocked-users-row">
            <Avatar size={40} src={resolveImageUrl(user.avatar_url)} initials={(user.username || '?').slice(0, 2).toUpperCase()} alt="" />
            <span className="blocked-users-name">{user.username}</span>
            <button
              type="button"
              className="blocked-users-unblock-btn"
              onClick={() => handleUnrestrict(user.id)}
              disabled={unrestrictingId === user.id}
              aria-label={t('restricted.unrestrictName', { name: user.username })}
            >
              {unrestrictingId === user.id ? t('restricted.unrestricting') : t('restricted.unrestrict')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RestrictedUsersScreen;
