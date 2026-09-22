import { useRef, useState } from 'react';
import api from './api';
import { useNavigate } from 'react-router-dom';
import MentionAutocomplete from './components/feed/MentionAutocomplete';
import { useMentionAutocomplete, applyMentionSelection } from './hooks/useMentionAutocomplete';

function CreatePost() {
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const textareaRef = useRef(null);
  const mention = useMentionAutocomplete();

  const handleContentChange = (e) => {
    setContent(e.target.value);
    mention.handleInputChange(e.target.value, e.target.selectionStart);
  };

  const handleMentionSelect = (user) => {
    const cursorPos = textareaRef.current?.selectionStart ?? content.length;
    const { value, cursorPos: nextCursorPos } = applyMentionSelection(content, cursorPos, user.username);
    setContent(value);
    mention.reset();
    // Restore focus + cursor position after React re-renders the textarea
    // with the new value -- setSelectionRange has to run after that paint.
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursorPos, nextCursorPos);
    });
  };

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
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          placeholder="What's on your mind? Use @ to mention someone, # for a hashtag"
          rows="5"
          style={{ width: '100%', maxWidth: '400px' }}
          required
        />
        {mention.active && <MentionAutocomplete suggestions={mention.suggestions} onSelect={handleMentionSelect} />}
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