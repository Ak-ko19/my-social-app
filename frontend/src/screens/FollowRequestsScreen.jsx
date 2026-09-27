import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { fetchFollowRequests, approveFollowRequest, denyFollowRequest } from '../services/postService';
import { resolveImageUrl } from '../api';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useTranslation } from 'react-i18next';
import './FollowRequestsScreen.css';
import '../components/feed/Feed.css';

function FollowRequestsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioningId, setActioningId] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    fetchFollowRequests(token)
      .then(setRequests)
      .catch((err) => {
        console.error(err);
        setError(t('followRequests.loadFailed'));
      })
      .finally(() => setLoading(false));
  }, [token, t]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  // Event handler, not an effect, so resetting to the loading state
  // synchronously here is fine.
  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const handleApprove = (userId) => {
    setActioningId(userId);
    setActionError('');
    approveFollowRequest(userId, token)
      .then(() => setRequests((current) => current.filter((r) => r.id !== userId)))
      .catch((err) => {
        console.error(err);
        setActionError(t('followRequests.approveFailed'));
      })
      .finally(() => setActioningId(null));
  };

  const handleDeny = (userId) => {
    setActioningId(userId);
    setActionError('');
    denyFollowRequest(userId, token)
      .then(() => setRequests((current) => current.filter((r) => r.id !== userId)))
      .catch((err) => {
        console.error(err);
        setActionError(t('followRequests.denyFailed'));
      })
      .finally(() => setActioningId(null));
  };

  return (
    <div className="screen-enter">
      <header className="follow-requests-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="follow-requests-header-title">{t('followRequests.title')}</h1>
      </header>

      {loading && <p className="follow-requests-status">{t('common.loading')}</p>}
      {!loading && error && <FeedErrorState message={error} onRetry={retry} />}
      {actionError && <p className="follow-requests-status" role="alert">{actionError}</p>}
      {!loading && !error && requests.length === 0 && (
        <p className="follow-requests-status">{t('followRequests.empty')}</p>
      )}

      <ul className="follow-requests-list">
        {requests.map((user) => (
          <li key={user.id} className="follow-requests-row">
            <Avatar size={40} src={resolveImageUrl(user.avatar_url)} initials={(user.username || '?').slice(0, 2).toUpperCase()} alt="" />
            <span className="follow-requests-name">{user.username}</span>
            <button
              type="button"
              className="follow-requests-btn follow-requests-btn-deny"
              onClick={() => handleDeny(user.id)}
              disabled={actioningId === user.id}
            >
              {t('followRequests.deny')}
            </button>
            <button
              type="button"
              className="follow-requests-btn follow-requests-btn-approve"
              onClick={() => handleApprove(user.id)}
              disabled={actioningId === user.id}
            >
              {t('followRequests.approve')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FollowRequestsScreen;
