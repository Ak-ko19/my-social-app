import { useState, useEffect } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate } from 'react-router-dom';

function notificationText(n) {
  if (n.type === 'like') return 'liked your post';
  if (n.type === 'comment') return 'commented on your post';
  if (n.type === 'follow') return 'started following you';
  return 'interacted with you';
}

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  const loadNotifications = () => {
    api.get('/notifications', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then((response) => {
      setNotifications(response.data.notifications);
      setLoading(false);
    })
    .catch((err) => {
      console.error(err);
      setError('Failed to load notifications');
      setLoading(false);
    });
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadNotifications();
  }, []);

  const markAsRead = (id) => {
    api.put(`/notifications/${id}/read`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => {
      setNotifications(notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    })
    .catch((err) => console.error(err));
  };

  const markAllAsRead = () => {
    api.put('/notifications/read-all', {}, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => {
      setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
    })
    .catch((err) => console.error(err));
  };

  if (loading) return <p>Loading notifications...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Notifications</h2>
      <p>
        <a href="/feed">Back to Feed</a>
        {' | '}
        <button onClick={markAllAsRead}>Mark all as read</button>
      </p>

      {notifications.length === 0 && <p>No notifications yet.</p>}

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
