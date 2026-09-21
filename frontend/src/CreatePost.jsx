import { useState } from 'react';
import api from './api';
import { useNavigate } from 'react-router-dom';

function CreatePost() {
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleImageChange = (e) => {
    const file = e.target.files[0] || null;
    setImage(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const token = localStorage.getItem('token');

    if (!token) {
      navigate('/login');
      return;
    }

    const formData = new FormData();
    formData.append('content', content);
    if (image) {
      formData.append('image', image);
    }

    api.post('/posts',
      formData,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then(() => {
      navigate('/');
    })
    .catch((err) => {
      console.error(err);
      setError(err.response?.data || 'Failed to create post. Please try again.');
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
        <div style={{ marginTop: '10px' }}>
          <label>Image (optional): </label>
          <input type="file" accept="image/*" onChange={handleImageChange} />
        </div>
        {imagePreview && (
          <div style={{ marginTop: '10px' }}>
            <img src={imagePreview} alt="Preview" style={{ maxWidth: '200px', maxHeight: '200px' }} />
          </div>
        )}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <div style={{ marginTop: '10px' }}>
          <button type="submit">Post</button>
        </div>
      </form>
      <p><a href="/">Back to Feed</a></p>
    </div>
  );
}

export default CreatePost;