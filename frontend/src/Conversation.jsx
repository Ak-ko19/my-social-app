import { useState, useEffect } from 'react';
import api from './api';
import { useParams, useNavigate } from 'react-router-dom';

function Conversation() {
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { userId } = useParams();
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const currentUserId = parseInt(localStorage.getItem('userId'));

  const loadConversation = () => {
    api.get(`/messages/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then((response) => {
      setMessages(response.data.messages);
      setLoading(false);
      api.put(`/messages/${userId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch((err) => console.error(err));
    })
    .catch((err) => {
      console.error(err);
      setError('Failed to load conversation');
      setLoading(false);
    });
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadConversation();
  }, [userId]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    api.post('/messages',
      { receiverId: userId, content },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then(() => {
      setContent('');
      loadConversation();
    })
    .catch((err) => {
      alert(err.response?.data || 'Failed to send message');
      console.error(err);
    });
  };

  if (loading) return <p>Loading conversation...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Conversation</h2>
      <p><a href="/messages">Back to Messages</a></p>

      <div style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px', minHeight: '200px' }}>
        {messages.length === 0 && <p>No messages yet. Say hello!</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              textAlign: m.sender_id === currentUserId ? 'right' : 'left',
              marginBottom: '8px'
            }}
          >
            <span style={{
              display: 'inline-block',
              padding: '6px 10px',
              borderRadius: '10px',
              backgroundColor: m.sender_id === currentUserId ? '#daf1da' : '#f0f0f0',
              maxWidth: '70%'
            }}>
              {m.content}
            </span>
            <br />
            <small>{new Date(m.created_at).toLocaleString()}</small>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend}>
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message..."
          style={{ width: '70%' }}
        />
        <button type="submit" style={{ marginLeft: '5px' }}>Send</button>
      </form>
    </div>
  );
}

export default Conversation;
