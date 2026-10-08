import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { fetchMutedUsers, unmuteUser } from '../services/muteService';
import { resolveImageUrl } from '../api';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useTranslation } from 'react-i18next';
import './BlockedUsersScreen.css';
import '../components/feed/Feed.css';

// Day 47: Settings -> Muted accounts. Same layout as Blocked users (its
// CSS); unmuting brings their posts and stories back to Home.
function MutedUsersScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [mutedUsers, setMutedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unmutingId, setUnmutingId] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    fetchMutedUsers(token)
      .then((data) => setMutedUsers(data.mutedUsers))
      .catch((err) => {
        console.error(err);
        setError(t('muted.loadFailed'));
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

  const handleUnmute = (userId) => {
    setUnmutingId(userId);
    setActionError('');
    unmuteUser(userId, token)
      .then(() => setMutedUsers((current) => current.filter((u) => u.id !== userId)))
      .catch((err) => {
        console.error(err);
        setActionError(t('muted.unmuteFailed'));
      })
      .finally(() => setUnmutingId(null));
  };

  return (
    <div className="screen-enter">
      <header className="blocked-users-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="blocked-users-header-title">{t('muted.title')}</h1>
      </header>

      {loading && <p className="blocked-users-status">{t('common.loading')}</p>}
      {!loading && error && <FeedErrorState message={error} onRetry={retry} />}
      {actionError && <p className="blocked-users-status" role="alert">{actionError}</p>}
      {!loading && !error && (
        <p className="blocked-users-status">{mutedUsers.length === 0 ? t('muted.empty') : t('muted.explain')}</p>
      )}

      <ul className="blocked-users-list">
        {mutedUsers.map((user) => (
          <li key={user.id} className="blocked-users-row">
            <Avatar size={40} src={resolveImageUrl(user.avatar_url)} initials={(user.username || '?').slice(0, 2).toUpperCase()} alt="" />
            <span className="blocked-users-name">{user.username}</span>
            <button
              type="button"
              className="blocked-users-unblock-btn"
              onClick={() => handleUnmute(user.id)}
              disabled={unmutingId === user.id}
              aria-label={t('muted.unmuteName', { name: user.username })}
            >
              {unmutingId === user.id ? t('muted.unmuting') : t('muted.unmute')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MutedUsersScreen;
