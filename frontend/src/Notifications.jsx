import { useState, useEffect, useCallback } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate } from 'react-router-dom';
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

  if (loading) return <p role="status" style={{ padding: '20px' }}>Loading notifications…</p>;
  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <h2>Notifications</h2>
        <p><a href="/">Back to Feed</a></p>
        <FeedErrorState message={error} onRetry={retry} />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>Notifications</h2>
      <p>
        <a href="/">Back to Feed</a>
        {' | '}
        <button onClick={markAllAsRead} disabled={notifications.every((n) => n.is_read)}>Mark all as read</button>
      </p>
      {actionError && <p role="alert" style={{ color: 'red' }}>{actionError}</p>}

      {notifications.length === 0 && <p role="status">No notifications yet.</p>}

      {notifications.map((n) => (
        <div
          key={n.id}
          style={{
            border: '1px solid #ccc',
            padding: '10px',
            marginBottom: '10px',
            backgroundColor: n.is_read ? '#fff' : '#eef6ff'
          }}
        >
          <img
            src={resolveImageUrl(n.actor_avatar_url)}
            alt=""
            hidden={!n.actor_avatar_url}
            style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '50%', verticalAlign: 'middle', marginRight: '8px' }}
          />
          <strong>{n.actor_username}</strong> {notificationText(n)}
          {n.post_content && <p style={{ margin: '5px 0', color: '#555' }}>"{n.post_content}"</p>}
          <div>
            <small>{new Date(n.created_at).toLocaleString()}</small>
            {!n.is_read && (
              <button onClick={() => markAsRead(n.id)} style={{ marginLeft: '10px' }}>Mark as read</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Notifications;
