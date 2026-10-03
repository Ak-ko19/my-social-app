import { useEffect, useRef, useState } from 'react';
import api from './api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Globe, Lock, Users, X } from 'lucide-react';
import { IconButton } from './components/ui';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';
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
  const { t } = useTranslation();
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
      setError(t('compose.tooMany', { max: MAX_IMAGES }));
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
      setError(serverErrorText(err, 'compose.failed'));
      setSubmitting(false);
    });
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={communityId ? t('compose.backToGroup') : pageId ? t('compose.backToPage') : t('common.backToHome')} onClick={() => navigate(backTo)} />
        <h1 className="screen-header-title">{communityId ? t('compose.inGroupTitle') : pageId ? t('compose.asPageTitle') : t('compose.title')}</h1>
      </header>
      <form className="screen-body form-stack" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">{t('compose.postLabel')}</span>
          <textarea
            ref={textareaRef}
            className="form-input"
            value={content}
            onChange={handleContentChange}
            placeholder={t('compose.placeholder')}
            rows="5"
            required
          />
        </label>
        {mention.active && <MentionAutocomplete suggestions={mention.suggestions} onSelect={handleMentionSelect} />}
        <label className="form-field">
          <span className="form-label">
            {t('compose.images', { max: MAX_IMAGES })}{images.length > 0 && t('compose.selectedCount', { count: images.length })}
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
          <legend className="form-label">{t('compose.audience')}</legend>
          <label className={visibility === 'public' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="visibility" value="public" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
            <Globe size={15} aria-hidden="true" /> {t('compose.public')}
          </label>
          <label className={visibility === 'followers' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="visibility" value="followers" checked={visibility === 'followers'} onChange={() => setVisibility('followers')} />
            <Users size={15} aria-hidden="true" /> {t('compose.followers')}
          </label>
          {/* Day 20: a private note on your own profile. */}
          <label className={visibility === 'only_me' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="visibility" value="only_me" checked={visibility === 'only_me'} onChange={() => setVisibility('only_me')} />
            <Lock size={15} aria-hidden="true" /> {t('compose.onlyMe')}
          </label>
        </fieldset>
        )}
        {images.length > 0 && (
          <ul className="image-picker-grid" aria-label={t('compose.selectedImages')}>
            {images.map((img, i) => (
              <li key={img.preview} className="image-picker-item">
                <img src={img.preview} alt={t('compose.selectedImage', { n: i + 1 })} />
                <button
                  type="button"
                  className="image-picker-remove"
                  aria-label={t('compose.removeImage', { n: i + 1 })}
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
          {submitting ? t('compose.posting') : t('compose.post')}
        </button>
      </form>
    </div>
  );
}

export default CreatePost;