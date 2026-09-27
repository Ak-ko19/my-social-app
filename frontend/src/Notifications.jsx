import { useState, useEffect, useCallback } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from './components/ui';
import FeedErrorState from './components/feed/FeedErrorState';
import { Trans, useTranslation } from 'react-i18next';
import { dateLocale } from './i18n';
import './components/feed/Feed.css';

// i18n key under notifications.types -- each is a whole sentence with the
// actor's name in it, since word order differs between languages.
function notificationKey(n) {
  if (n.type === 'like') return 'like';
  if (n.type === 'comment') return 'comment';
  if (n.type === 'follow') return 'follow';
  if (n.type === 'mention') return n.comment_id ? 'mentionComment' : 'mentionPost';
  if (n.type === 'follow_request') return 'followRequest';
  if (n.type === 'follow_accepted') return 'followAccepted';
  if (n.type === 'reply') return 'reply';
  if (n.type === 'comment_like') return 'commentLike';
  return 'other';
}

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

  const token = localStorage.getItem('token');

  const loadNotifications = useCallback(() => {
    api.get('/notifications', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then((response) => {
      setNotifications(response.data.notifications);
      setError('');
    })
    .catch((err) => {
      console.error(err);
      setError(t('notifications.loadFailed'));
    })
    .finally(() => setLoading(false));
  }, [token, t]);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadNotifications();
  }, [token, navigate, loadNotifications]);

  const retry = () => {
    setError('');
    setLoading(true);
    loadNotifications();
  };

  const markAsRead = (id) => {
    setActionError('');
    api.put(`/notifications/${id}/read`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => {
      setNotifications((current) => current.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    })
    .catch((err) => {
      console.error(err);
      setActionError(t('notifications.markFailed'));
    });
  };

  const markAllAsRead = () => {
    setActionError('');
    api.put('/notifications/read-all', {}, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => {
      setNotifications((current) => current.map((n) => ({ ...n, is_read: true })));
    })
    .catch((err) => {
      console.error(err);
      setActionError(t('notifications.markAllFailed'));
    });
  };

  const allRead = notifications.every((n) => n.is_read);

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToHome')} onClick={() => navigate('/')} />
        <h1 className="screen-header-title">{t('notifications.title')}</h1>
        {!loading && !error && notifications.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={markAllAsRead} disabled={allRead}>
            {t('notifications.markAll')}
          </button>
        )}
      </header>

      <div className="screen-body">
        {loading && <p className="screen-status" role="status">{t('notifications.loading')}</p>}
        {!loading && error && <FeedErrorState message={error} onRetry={retry} />}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {!loading && !error && notifications.length === 0 && (
          <p className="screen-status" role="status">{t('notifications.empty')}</p>
        )}

        {!loading && !error && notifications.length > 0 && (
          <ul className="card-list">
            {notifications.map((n) => (
              <li key={n.id} className={n.is_read ? 'card-row' : 'card-row card-row-highlight'}>
                <Avatar
                  size={36}
                  src={resolveImageUrl(n.actor_avatar_url)}
                  initials={(n.actor_username || '?').slice(0, 2).toUpperCase()}
                  alt=""
                />
                <div className="card-row-body">
                  <Trans i18nKey={`notifications.types.${notificationKey(n)}`} values={{ name: n.actor_username }} components={{ b: <strong /> }} />
                  {n.post_content && <p className="card-row-quote">“{n.post_content}”</p>}
                  <span className="card-row-meta">{new Date(n.created_at).toLocaleString(dateLocale())}</span>
                  {!n.is_read && (
                    <div className="card-row-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => markAsRead(n.id)}>
                        {t('notifications.markRead')}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Notifications;
