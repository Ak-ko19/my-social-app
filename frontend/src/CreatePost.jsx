import { useEffect, useRef, useState } from 'react';
import api from './api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Globe, Users, X } from 'lucide-react';
import { IconButton } from './components/ui';
import MentionAutocomplete from './components/feed/MentionAutocomplete';
import { useMentionAutocomplete, applyMentionSelection } from './hooks/useMentionAutocomplete';

// Matches the backend's MAX_POST_IMAGES (middleware/cloudinaryUpload.js).
const MAX_IMAGES = 10;

function CreatePost() {
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]); // [{ file, preview }]
  const [submitting, setSubmitting] = useState(false);
  const [visibility, setVisibility] = useState('public'); // B5 audience
  const [error, setError] = useState('');
  const navigate = useNavigate();
  // B13: /create-post?communityId=N posts inside that group.
  const [searchParams] = useSearchParams();
  const communityId = searchParams.get('communityId');
  // B14: /create-post?pageId=N posts as that page (owner only; always public).
  const pageId = searchParams.get('pageId');
  const backTo = communityId ? `/groups/${communityId}` : pageId ? `/pages/${pageId}` : '/';
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

  // Picking more files ADDS to the selection (up to MAX_IMAGES) instead of
  // replacing it, so images can be chosen across several picker opens.
  const handleImageChange = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-picking the same file after removing it
    if (picked.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (picked.length > room) {
      setError(`You can attach up to ${MAX_IMAGES} images.`);
    } else {
      setError('');
    }
    const added = picked.slice(0, Math.max(0, room)).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setImages((current) => [...current, ...added]);
  };

  const removeImage = (index) => {
    setImages((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, i) => i !== index);
    });
    setError('');
  };

  // Free the preview blob URLs when leaving the screen.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.preview)), []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const token = localStorage.getItem('token');

    if (!token) {
      navigate('/login');
      return;
    }

    const formData = new FormData();
    formData.append('content', content);
    if (communityId) formData.append('communityId', communityId);
    else if (pageId) formData.append('pageId', pageId);
    else formData.append('visibility', visibility);
    images.forEach((img) => formData.append('images', img.file));

    setSubmitting(true);
    api.post('/posts',
      formData,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then(() => {
      navigate(backTo);
    })
    .catch((err) => {
      console.error(err);
      setError(err.response?.data || 'Failed to create post. Please try again.');
      setSubmitting(false);
    });
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={communityId ? 'Back to the group' : pageId ? 'Back to the page' : 'Back to Home'} onClick={() => navigate(backTo)} />
        <h1 className="screen-header-title">{communityId ? 'Post in group' : pageId ? 'Post as page' : 'Create Post'}</h1>
      </header>
      <form className="screen-body form-stack" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Post</span>
          <textarea
            ref={textareaRef}
            className="form-input"
            value={content}
            onChange={handleContentChange}
            placeholder="What's on your mind? Use @ to mention someone, # for a hashtag"
            rows="5"
            required
          />
        </label>
        {mention.active && <MentionAutocomplete suggestions={mention.suggestions} onSelect={handleMentionSelect} />}
        <label className="form-field">
          <span className="form-label">
            Images (optional, up to {MAX_IMAGES}){images.length > 0 && ` · ${images.length} selected`}
          </span>
          <input
            className="form-file"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={handleImageChange}
            disabled={images.length >= MAX_IMAGES || submitting}
          />
        </label>
        {!communityId && !pageId && (
        <fieldset className="audience-picker">
          <legend className="form-label">Who can see this?</legend>
          <label className={visibility === 'public' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="visibility" value="public" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
            <Globe size={15} aria-hidden="true" /> Public
          </label>
          <label className={visibility === 'followers' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="visibility" value="followers" checked={visibility === 'followers'} onChange={() => setVisibility('followers')} />
            <Users size={15} aria-hidden="true" /> Followers
          </label>
        </fieldset>
        )}
        {images.length > 0 && (
          <ul className="image-picker-grid" aria-label="Selected images">
            {images.map((img, i) => (
              <li key={img.preview} className="image-picker-item">
                <img src={img.preview} alt={`Selected image ${i + 1}`} />
                <button
                  type="button"
                  className="image-picker-remove"
                  aria-label={`Remove image ${i + 1}`}
                  onClick={() => removeImage(i)}
                  disabled={submitting}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  );
}

export default CreatePost;