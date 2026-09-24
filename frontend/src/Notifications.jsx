import { useState, useEffect, useCallback } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from './components/ui';
import FeedErrorState from './components/feed/FeedErrorState';
import './components/feed/Feed.css';

function notificationText(n) {
  if (n.type === 'like') return 'liked your post';
  if (n.type === 'comment') return 'commented on your post';
  if (n.type === 'follow') return 'started following you';
  if (n.type === 'mention') return n.comment_id ? 'mentioned you in a comment' : 'mentioned you in a post';
  if (n.type === 'follow_request') return 'requested to follow you';
  if (n.type === 'follow_accepted') return 'accepted your follow request';
  return 'interacted with you';
}

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const navigate = useNavigate();

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
      setError('Failed to load notifications');
    })
    .finally(() => setLoading(false));
  }, [token]);

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
      setActionError('Failed to mark as read. Please try again.');
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
      setActionError('Failed to mark all as read. Please try again.');
    });
  };

  const allRead = notifications.every((n) => n.is_read);

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Home" onClick={() => navigate('/')} />
        <h1 className="screen-header-title">Notifications</h1>
        {!loading && !error && notifications.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={markAllAsRead} disabled={allRead}>
            Mark all read
          </button>
        )}
      </header>

      <div className="screen-body">
        {loading && <p className="screen-status" role="status">Loading notifications…</p>}
        {!loading && error && <FeedErrorState message={error} onRetry={retry} />}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {!loading && !error && notifications.length === 0 && (
          <p className="screen-status" role="status">No notifications yet.</p>
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
                  <strong>{n.actor_username}</strong> {notificationText(n)}
                  {n.post_content && <p className="card-row-quote">“{n.post_content}”</p>}
                  <span className="card-row-meta">{new Date(n.created_at).toLocaleString()}</span>
                  {!n.is_read && (
                    <div className="card-row-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => markAsRead(n.id)}>
                        Mark as read
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
