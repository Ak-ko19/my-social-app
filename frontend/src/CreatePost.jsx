import { useEffect, useRef, useState } from 'react';
import api, { resolveImageUrl } from './api';
import { getOptimizedImageUrl } from './utils/cloudinaryImage';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, Check, ChevronLeft, ChevronRight, FileText, Globe, ImagePlus, ListChecks, Lock, Plus, Star, Users, X } from 'lucide-react';
import { IconButton } from './components/ui';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';
import { MAX_POST_LENGTH } from './utils/textLimits';
import MentionAutocomplete from './components/feed/MentionAutocomplete';
import AltTextDialog from './components/feed/AltTextDialog';
import { useMentionAutocomplete, applyMentionSelection } from './hooks/useMentionAutocomplete';
import {
  fetchDraft, saveDraft, publishDraft, toLocalInputValue, fromLocalInputValue, scheduleProblem,
  MIN_SCHEDULE_MINUTES, MAX_SCHEDULE_DAYS
} from './services/draftService';
import { timeZone } from './utils/localTime';
import { compressImage } from './utils/compressImage';
import { fetchPost, updatePostWithAudience, savePostPhotos } from './services/postService';

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

// Day 95: a photo tile's "Alt" button (its description, for screen
// readers). Its name starts with the visible word, in EN and AR, and says
// whether the photo has one.
function AltButton({ described, n, disabled, onClick }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={described ? 'image-picker-alt is-described' : 'image-picker-alt'}
      aria-label={t(described ? 'compose.altEdit' : 'compose.altAdd', { n })}
      onClick={onClick}
      disabled={disabled}
    >
      {described && <Check size={12} aria-hidden="true" />}
      {t('compose.altShort')}
    </button>
  );
}

// Photos already saved (a draft's or a post's), as the form holds them.
const savedPhotos = (media) => media.map((m) => ({ key: m.url, url: m.url, alt: m.alt || '' }));

function CreatePost() {
  const [content, setContent] = useState('');
  // The photos, in order (Day 96: one list, so any photo can move): a photo
  // already saved (a draft's or, when editing, the post's) is { key: url,
  // url, alt }; a new pick is { key: preview, file, preview, alt }.
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  // Day 57: photos still being shrunk -- Post waits for them.
  const [preparing, setPreparing] = useState(0);
  const [visibility, setVisibility] = useState('public'); // B5 audience
  const [error, setError] = useState('');
  // Day 44: an optional poll; the post's text is its question.
  const [pollOn, setPollOn] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollHours, setPollHours] = useState(24);
  // Day 45: editing a draft (?draftId=N) -- its group/page, and "Schedule
  // for later".
  // Day 95: which photo's description dialog is open: { key, n }.
  const [altFor, setAltFor] = useState(null);
  const [draftPlace, setDraftPlace] = useState({ communityId: null, pageId: null });
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  // When the screen opened: "Schedule for later" suggests an hour after it.
  const [now] = useState(() => Date.now());
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draftId');
  // Day 96: editing a published post (?editPostId=N) -- its text, audience
  // and photos (Facebook's "Edit post"); shares and polls are edited on
  // their card instead.
  const editPostId = searchParams.get('editPostId');
  const [draftState, setDraftState] = useState(draftId || editPostId ? 'loading' : 'none'); // none | loading | ready | missing
  // B13: /create-post?communityId=N posts inside that group.
  // B14: /create-post?pageId=N posts as that page (owner only; always public).
  // A draft brings its own.
  const communityId = draftId || editPostId ? draftPlace.communityId : searchParams.get('communityId');
  const pageId = draftId || editPostId ? draftPlace.pageId : searchParams.get('pageId');
  const backTo = editPostId ? `/posts/${editPostId}` : draftId ? '/drafts' : communityId ? `/groups/${communityId}` : pageId ? `/pages/${pageId}` : '/';
  const textareaRef = useRef(null);
  const mention = useMentionAutocomplete();
  const token = localStorage.getItem('token');
  const photoCount = photos.length;

  // Day 45: open the draft into the form.
  useEffect(() => {
    if (!draftId) return undefined;
    let cancelled = false;
    fetchDraft(draftId, token)
      .then((draft) => {
        if (cancelled) return;
        setContent(draft.content);
        setVisibility(draft.visibility);
        setPhotos(savedPhotos(draft.media));
        setDraftPlace({
          communityId: draft.community_id ? String(draft.community_id) : null,
          pageId: draft.page_id ? String(draft.page_id) : null
        });
        if (draft.poll) {
          setPollOn(true);
          setPollOptions(draft.poll.options);
          setPollHours(draft.poll.durationHours);
        }
        if (draft.scheduled_for) {
          setScheduleOn(true);
          setScheduleAt(toLocalInputValue(draft.scheduled_for));
        }
        setDraftState('ready');
      })
      .catch(() => {
        if (!cancelled) setDraftState('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, token]);

  // Day 96: open the post into the form.
  useEffect(() => {
    if (!editPostId) return undefined;
    let cancelled = false;
    fetchPost(editPostId, token)
      .then((post) => {
        if (cancelled) return;
        // A share or a poll isn't edited here (their card edits the text).
        if (post.is_share || post.poll) {
          setDraftState('missing');
          return;
        }
        setContent(post.content);
        setVisibility(post.visibility || 'public');
        setPhotos(savedPhotos(post.media || []));
        setDraftPlace({
          communityId: post.community_id ? String(post.community_id) : null,
          pageId: post.page ? String(post.page.id) : null
        });
        setDraftState('ready');
      })
      .catch(() => {
        if (!cancelled) setDraftState('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [editPostId, token]);

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
  // Day 57: each photo is shrunk in the browser first (utils/compressImage).
  const handleImageChange = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-picking the same file after removing it
    if (picked.length === 0) return;
    const room = MAX_IMAGES - photoCount;
    if (picked.length > room) {
      setError(t('compose.tooMany', { max: MAX_IMAGES }));
    } else {
      setError('');
    }
    const chosen = picked.slice(0, Math.max(0, room));
    setPreparing((n) => n + chosen.length);
    try {
      const files = await Promise.all(chosen.map((file) => compressImage(file)));
      const added = files.map((file) => {
        const preview = URL.createObjectURL(file);
        return { key: preview, file, preview, alt: '' };
      });
      setPhotos((current) => [...current, ...added]);
    } finally {
      setPreparing((n) => n - chosen.length);
    }
  };

  const removePhoto = (key) => {
    setPhotos((current) => {
      const gone = current.find((photo) => photo.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return current.filter((photo) => photo.key !== key);
    });
    setError('');
  };
  // Day 96: one place earlier (-1) or later (+1).
  const movePhoto = (index, step) => {
    setPhotos((current) => {
      const next = [...current];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });
  };

  // Day 95: the open dialog's photo gets its description.
  const saveAlt = (text) => {
    setPhotos((current) => current.map((photo) => (photo.key === altFor?.key ? { ...photo, alt: text } : photo)));
  };

  const setPollOption = (index, value) => setPollOptions((current) => current.map((o, i) => (i === index ? value : o)));
  const addPollOption = () => setPollOptions((current) => (current.length < POLL_MAX_OPTIONS ? [...current, ''] : current));
  const removePollOption = (index) => setPollOptions((current) => current.filter((_, i) => i !== index));

  // Free the preview blob URLs when leaving the screen.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => photo.preview && URL.revokeObjectURL(photo.preview)), []);

  // Day 44: the poll rules the server applies, explained here. Returns the
  // trimmed options, or null after showing what's wrong.
  const checkedPollOptions = () => {
    const options = pollOptions.map((o) => o.trim());
    if (pollOn && options.some((o) => !o)) {
      setError(t('compose.pollOptionsEmpty'));
      return null;
    }
    if (pollOn && new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      setError(t('compose.pollOptionsSame'));
      return null;
    }
    return options;
  };

  // The photos for a form: the new files (in order), and -- where photos
  // are already saved (a draft, a post being edited) -- their order as
  // "photos": a saved one's URL or { upload: i } (Day 96). Day 95: the
  // descriptions in that order.
  const appendPhotos = (formData, withOrder) => {
    let uploads = 0;
    const order = photos.map((photo) => (photo.url ? photo.url : { upload: uploads++ }));
    photos.forEach((photo) => photo.file && formData.append('images', photo.file));
    if (withOrder) formData.append('photos', JSON.stringify(order));
    if (photoCount > 0) formData.append('altTexts', JSON.stringify(photos.map((photo) => photo.alt || '')));
  };

  // The form the server takes for a post and for a draft.
  const buildForm = (options, extra = {}) => {
    const formData = new FormData();
    formData.append('content', content);
    if (pollOn) formData.append('poll', JSON.stringify({ options, durationHours: pollHours }));
    if (communityId) formData.append('communityId', communityId);
    else if (pageId) formData.append('pageId', pageId);
    else formData.append('visibility', visibility);
    for (const [key, value] of Object.entries(extra)) formData.append(key, value);
    appendPhotos(formData, Boolean(draftId));
    return formData;
  };

  const run = (work, fallbackKey) => {
    setSubmitting(true);
    work().catch((err) => {
      console.error(err);
      setError(serverErrorText(err, fallbackKey));
      setSubmitting(false);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    if (!token) {
      navigate('/login');
      return;
    }
    // Day 96: the photos first (an upload is likelier to fail), then the
    // text and audience. Once the photos are saved the form holds them as
    // the post's own, so trying again never uploads them twice.
    if (editPostId) {
      run(async () => {
        const photosForm = new FormData();
        appendPhotos(photosForm, true);
        const saved = await savePostPhotos(editPostId, photosForm, token);
        photos.forEach((photo) => photo.preview && URL.revokeObjectURL(photo.preview));
        setPhotos(savedPhotos(saved.media));
        await updatePostWithAudience(editPostId, { content, ...(communityId || pageId ? {} : { visibility }) }, token);
        navigate(backTo);
      }, 'feed.updateFailed');
      return;
    }

    const options = checkedPollOptions();
    if (!options) return;

    // Day 45: scheduled -- saved as a draft with a time.
    if (scheduleOn) {
      const when = fromLocalInputValue(scheduleAt);
      const problem = scheduleProblem(when);
      if (problem) {
        setError(t(problem, { min: MIN_SCHEDULE_MINUTES, max: MAX_SCHEDULE_DAYS }));
        return;
      }
      run(async () => {
        await saveDraft(buildForm(options, { scheduledFor: when.toISOString() }), token, draftId);
        navigate('/drafts?tab=scheduled');
      }, 'drafts.saveFailed');
      return;
    }
    // A draft goes up as it is now: saved first, then published.
    if (draftId) {
      run(async () => {
        await saveDraft(buildForm(options, { scheduledFor: '' }), token, draftId);
        await publishDraft(draftId, token);
        navigate(communityId ? `/groups/${communityId}` : pageId ? `/pages/${pageId}` : '/');
      }, 'compose.failed');
      return;
    }
    run(async () => {
      await api.post('/posts', buildForm(options), { headers: { Authorization: `Bearer ${token}` } });
      navigate(backTo);
    }, 'compose.failed');
  };

  // Day 45: keep it for later (not scheduled).
  const handleSaveDraft = () => {
    if (submitting) return;
    setError('');
    if (!token) {
      navigate('/login');
      return;
    }
    if (!content.trim() && photoCount === 0 && !pollOn) {
      setError(t('drafts.empty'));
      return;
    }
    const options = checkedPollOptions();
    if (!options) return;
    run(async () => {
      await saveDraft(buildForm(options, { scheduledFor: '' }), token, draftId);
      navigate('/drafts');
    }, 'drafts.saveFailed');
  };

  const title = editPostId ? t('compose.editTitle') : draftId ? t('drafts.editTitle') : communityId ? t('compose.inGroupTitle') : pageId ? t('compose.asPageTitle') : t('compose.title');
  const backLabel = editPostId ? t('compose.backToPost') : draftId ? t('drafts.backToDrafts') : communityId ? t('compose.backToGroup') : pageId ? t('compose.backToPage') : t('common.backToHome');

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={backLabel} onClick={() => navigate(backTo)} />
        <h1 className="screen-header-title">{title}</h1>
        {!draftId && !editPostId && <IconButton icon={FileText} aria-label={t('drafts.open')} onClick={() => navigate('/drafts')} />}
      </header>
      {draftState === 'loading' && <p className="screen-status" role="status">{t('common.loading')}</p>}
      {draftState === 'missing' && (
        <div className="screen-body">
          <p className="form-error" role="alert">{editPostId ? t('compose.editUnavailable') : t('drafts.notFound')}</p>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(backTo)}>{backLabel}</button>
        </div>
      )}
      {(draftState === 'none' || draftState === 'ready') && (
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
        {/* Day 44: a poll instead of photos (a poll post has none, like X).
            Day 96: not when editing (a published post's poll can't change). */}
        {!editPostId && (
        <button
          type="button"
          className="btn btn-secondary btn-sm compose-poll-toggle"
          onClick={() => { setPollOn((on) => !on); setError(''); }}
          disabled={submitting || (!pollOn && photoCount > 0)}
        >
          <ListChecks size={16} aria-hidden="true" /> {pollOn ? t('compose.removePoll') : t('compose.addPoll')}
        </button>
        )}
        {!editPostId && !pollOn && photoCount > 0 && <p className="form-hint">{t('compose.pollNoPhotos')}</p>}
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
        {/* A translated button, not the browser's own "Choose Files / No
            file chosen" (that one is in the browser's language). */}
        {!pollOn && (
        <div className="form-field">
          <span className="form-label">
            {t('compose.images', { max: MAX_IMAGES })}{photoCount > 0 && t('compose.selectedCount', { count: photoCount })}
          </span>
          <label className={`btn btn-secondary btn-sm form-file-button${photoCount >= MAX_IMAGES || submitting ? ' is-disabled' : ''}`}>
            <ImagePlus size={16} aria-hidden="true" /> {t('compose.choosePhotos')}
            <input
              className="feed-visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={handleImageChange}
              disabled={photoCount >= MAX_IMAGES || submitting}
            />
          </label>
        </div>
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
          {/* Day 47: only the people on your close friends list. */}
          <label className={visibility === 'close_friends' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="visibility" value="close_friends" checked={visibility === 'close_friends'} onChange={() => setVisibility('close_friends')} />
            <Star size={15} aria-hidden="true" /> {t('compose.closeFriends')}
          </label>
          {/* Day 20: a private note on your own profile. */}
          <label className={visibility === 'only_me' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="visibility" value="only_me" checked={visibility === 'only_me'} onChange={() => setVisibility('only_me')} />
            <Lock size={15} aria-hidden="true" /> {t('compose.onlyMe')}
          </label>
        </fieldset>
        )}
        {photoCount > 0 && (
          <ul className="image-picker-grid" aria-label={t('compose.selectedImages')}>
            {photos.map((photo, i) => (
              <li key={photo.key} className="image-picker-item">
                {/* Day 74: a ~90px tile -- not the full-size stored photo. */}
                {photo.url
                  ? <img src={getOptimizedImageUrl(resolveImageUrl(photo.url), 300)} alt={t('compose.selectedImage', { n: i + 1 })} decoding="async" />
                  : <img src={photo.preview} alt={t('compose.selectedImage', { n: i + 1 })} />}
                <button
                  type="button"
                  className="image-picker-remove"
                  aria-label={t('compose.removeImage', { n: i + 1 })}
                  onClick={() => removePhoto(photo.key)}
                  disabled={submitting}
                >
                  <X size={14} aria-hidden="true" />
                </button>
                <AltButton described={Boolean(photo.alt)} n={i + 1} disabled={submitting} onClick={() => setAltFor({ key: photo.key, n: i + 1 })} />
                {/* Day 96: the order (chevrons flip in RTL: earlier points to the start). */}
                {photoCount > 1 && (
                  <span className="image-picker-move">
                    {i > 0 && (
                      <button type="button" aria-label={t('compose.moveEarlier', { n: i + 1 })} onClick={() => movePhoto(i, -1)} disabled={submitting}>
                        <ChevronLeft size={14} aria-hidden="true" />
                      </button>
                    )}
                    {i < photoCount - 1 && (
                      <button type="button" aria-label={t('compose.moveLater', { n: i + 1 })} onClick={() => movePhoto(i, 1)} disabled={submitting}>
                        <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {altFor && (
          <AltTextDialog
            n={altFor.n}
            initial={photos.find((photo) => photo.key === altFor.key)?.alt}
            onSave={saveAlt}
            onClose={() => setAltFor(null)}
          />
        )}
        {/* Day 45: schedule for later, in the person's own time zone. */}
        {!editPostId && (
        <div className="compose-schedule">
          <label className="compose-schedule-toggle">
            <input
              type="checkbox"
              checked={scheduleOn}
              onChange={(e) => {
                setScheduleOn(e.target.checked);
                setError('');
                if (e.target.checked && !scheduleAt) setScheduleAt(toLocalInputValue(new Date(now + 60 * 60 * 1000)));
              }}
              disabled={submitting}
            />
            <CalendarClock size={16} aria-hidden="true" /> {t('drafts.scheduleLater')}
          </label>
          {/* No min/max: the browser would explain those in ITS language;
              the range is checked on submit, in the app's (EN/AR). */}
          {scheduleOn && (
            <div className="form-field">
            <label className="form-field">
              <span className="form-label">{t('drafts.when')}</span>
              <input
                type="datetime-local"
                className="form-input"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                dir="ltr"
                aria-describedby={timeZone() ? 'compose-schedule-zone' : undefined}
              />
            </label>
            {timeZone() && <span id="compose-schedule-zone" className="form-hint">{t('drafts.timeZone', { zone: timeZone() })}</span>}
            </div>
          )}
        </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {preparing > 0 && <p className="form-hint" role="status">{t('compose.preparingPhotos', { count: preparing })}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting || preparing > 0}>
          {editPostId
            ? (submitting ? t('common.saving') : t('common.save'))
            : scheduleOn
              ? (submitting ? t('drafts.scheduling') : t('drafts.schedule'))
              : (submitting ? t('compose.posting') : t('compose.post'))}
        </button>
        {!editPostId && (
        <button type="button" className="btn btn-secondary btn-block" onClick={handleSaveDraft} disabled={submitting || preparing > 0}>
          {t('drafts.saveDraft')}
        </button>
        )}
      </form>
      )}
    </div>
  );
}

export default CreatePost;
