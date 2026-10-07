import { useEffect, useRef, useState } from 'react';
import api from './api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Globe, ListChecks, Lock, Plus, Users, X } from 'lucide-react';
import { IconButton } from './components/ui';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';
import { MAX_POST_LENGTH } from './utils/textLimits';
import MentionAutocomplete from './components/feed/MentionAutocomplete';
import { useMentionAutocomplete, applyMentionSelection } from './hooks/useMentionAutocomplete';

// Matches the backend's MAX_POST_IMAGES (middleware/cloudinaryUpload.js).
const MAX_IMAGES = 10;
// Day 44: polls -- the backend's limits (services/pollService.js).
const POLL_MIN_OPTIONS = 2;
const POLL_MAX_OPTIONS = 4;
const POLL_LABEL_MAX = 50;
const POLL_LENGTHS = [
  { hours: 24, key: 'compose.pollOneDay' },
  { hours: 72, key: 'compose.pollThreeDays' },
  { hours: 168, key: 'compose.pollOneWeek' }
];

function CreatePost() {
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]); // [{ file, preview }]
  const [submitting, setSubmitting] = useState(false);
  const [visibility, setVisibility] = useState('public'); // B5 audience
  const [error, setError] = useState('');
  // Day 44: an optional poll; the post's text is its question.
  const [pollOn, setPollOn] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollHours, setPollHours] = useState(24);
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

  const setPollOption = (index, value) => setPollOptions((current) => current.map((o, i) => (i === index ? value : o)));
  const addPollOption = () => setPollOptions((current) => (current.length < POLL_MAX_OPTIONS ? [...current, ''] : current));
  const removePollOption = (index) => setPollOptions((current) => current.filter((_, i) => i !== index));

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

    // Day 44: the same rules the server applies, so they're explained here.
    const options = pollOptions.map((o) => o.trim());
    if (pollOn && options.some((o) => !o)) {
      setError(t('compose.pollOptionsEmpty'));
      return;
    }
    if (pollOn && new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      setError(t('compose.pollOptionsSame'));
      return;
    }

    const formData = new FormData();
    formData.append('content', content);
    if (pollOn) formData.append('poll', JSON.stringify({ options, durationHours: pollHours }));
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
            placeholder={pollOn ? t('compose.pollPlaceholder') : t('compose.placeholder')}
            maxLength={MAX_POST_LENGTH}
            rows="5"
            required
          />
        </label>
        {mention.active && <MentionAutocomplete suggestions={mention.suggestions} onSelect={handleMentionSelect} />}
        {/* Day 44: a poll instead of photos (a poll post has none, like X). */}
        <button
          type="button"
          className="btn btn-secondary btn-sm compose-poll-toggle"
          onClick={() => { setPollOn((on) => !on); setError(''); }}
          disabled={submitting || (!pollOn && images.length > 0)}
        >
          <ListChecks size={16} aria-hidden="true" /> {pollOn ? t('compose.removePoll') : t('compose.addPoll')}
        </button>
        {!pollOn && images.length > 0 && <p className="form-hint">{t('compose.pollNoPhotos')}</p>}
        {pollOn && (
          <fieldset className="poll-editor">
            <legend className="form-label">{t('compose.pollLegend')}</legend>
            {pollOptions.map((value, i) => (
              <div key={i} className="poll-editor-row">
                <input
                  className="form-input"
                  value={value}
                  onChange={(e) => setPollOption(i, e.target.value)}
                  maxLength={POLL_LABEL_MAX}
                  placeholder={t('compose.pollOption', { n: i + 1 })}
                  aria-label={t('compose.pollOption', { n: i + 1 })}
                  required
                />
                {pollOptions.length > POLL_MIN_OPTIONS && (
                  <IconButton icon={X} aria-label={t('compose.removePollOption', { n: i + 1 })} onClick={() => removePollOption(i)} />
                )}
              </div>
            ))}
            {pollOptions.length < POLL_MAX_OPTIONS && (
              <button type="button" className="btn btn-secondary btn-sm poll-editor-add" onClick={addPollOption}>
                <Plus size={16} aria-hidden="true" /> {t('compose.addPollOption')}
              </button>
            )}
            <label className="form-field">
              <span className="form-label">{t('compose.pollLength')}</span>
              <select className="form-input" value={pollHours} onChange={(e) => setPollHours(Number(e.target.value))}>
                {POLL_LENGTHS.map((l) => <option key={l.hours} value={l.hours}>{t(l.key)}</option>)}
              </select>
            </label>
          </fieldset>
        )}
        {!pollOn && (
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
        )}
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