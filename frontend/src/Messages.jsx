import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Messages() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    axios.get('http://localhost:3000/conversations', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then((response) => {
      setConversations(response.data);
      setLoading(false);
    })
    .catch((err) => {
      console.error(err);
      setError('Failed to load conversations');
      setLoading(false);
    });
  }, []);

  if (loading) return <p>Loading conversations...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Messages</h2>
      <p><a href="/feed">Back to Feed</a></p>

      {conversations.length === 0 && <p>No conversations yet.</p>}

      {conversations.map((c) => (
        <div
          key={c.userId}
          onClick={() => navigate(`/messages/${c.userId}`)}
          style={{
            border: '1px solid #ccc',
            padding: '10px',
            marginBottom: '10px',
            cursor: 'pointer',
            backgroundColor: c.unreadCount > 0 ? '#eef6ff' : '#fff'
          }}
        >
          <img
            src={c.avatarUrl ? `http://localhost:3000${c.avatarUrl}` : undefined}
            alt=""
            hidden={!c.avatarUrl}
            style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '50%', verticalAlign: 'middle', marginRight: '8px' }}
          />
          <strong>{c.username}</strong>
          {c.unreadCount > 0 && <span style={{ marginLeft: '8px', color: 'red' }}>({c.unreadCount} new)</span>}
          <p style={{ margin: '5px 0', color: '#555' }}>{c.lastMessage}</p>
          <small>{new Date(c.lastMessageAt).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}

export default Messages;
