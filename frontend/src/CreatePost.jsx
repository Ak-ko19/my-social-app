import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function CreatePost() {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const token = localStorage.getItem('token');

    if (!token) {
      navigate('/login');
      return;
    }

    axios.post('http://localhost:3000/posts',
      { content: content },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then(() => {
      navigate('/feed');
    })
    .catch((err) => {
      console.error(err);
      setError('Failed to create post. Please try again.');
    });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Create Post</h2>
      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          rows="5"
          style={{ width: '100%', maxWidth: '400px' }}
          required
        />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <div style={{ marginTop: '10px' }}>
          <button type="submit">Post</button>
        </div>
      </form>
      <p><a href="/feed">Back to Feed</a></p>
    </div>
  );
}

export default CreatePost;