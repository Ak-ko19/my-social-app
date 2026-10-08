import { useEffect, useRef, useState } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, ChevronLeft, FileText, Globe, ImagePlus, ListChecks, Lock, Plus, Star, Users, X } from 'lucide-react';
import { IconButton } from './components/ui';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';
import { MAX_POST_LENGTH } from './utils/textLimits';
import MentionAutocomplete from './components/feed/MentionAutocomplete';
import { useMentionAutocomplete, applyMentionSelection } from './hooks/useMentionAutocomplete';
import {
  fetchDraft, saveDraft, publishDraft, toLocalInputValue, fromLocalInputValue, scheduleProblem,
  MIN_SCHEDULE_MINUTES, MAX_SCHEDULE_DAYS
} from './services/draftService';

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

// Day 45: the time zone the date-time picker is in, e.g. "Asia/Dubai".
const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};

function CreatePost() {
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]); // [{ file, preview }] -- new picks
  const [submitting, setSubmitting] = useState(false);
  const [visibility, setVisibility] = useState('public'); // B5 audience
  const [error, setError] = useState('');
  // Day 44: an optional poll; the post's text is its question.
  const [pollOn, setPollOn] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollHours, setPollHours] = useState(24);
  // Day 45: editing a draft (?draftId=N) -- its already-uploaded photos,
  // its group/page, and "Schedule for later".
  const [keptMedia, setKeptMedia] = useState([]); // URLs of the draft's photos still in it
  const [draftPlace, setDraftPlace] = useState({ communityId: null, pageId: null });
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  // When the screen opened: "Schedule for later" suggests an hour after it.
  const [now] = useState(() => Date.now());
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draftId');
  const [draftState, setDraftState] = useState(draftId ? 'loading' : 'none'); // none | loading | ready | missing
  // B13: /create-post?communityId=N posts inside that group.
  // B14: /create-post?pageId=N posts as that page (owner only; always public).
  // A draft brings its own.
  const communityId = draftId ? draftPlace.communityId : searchParams.get('communityId');
  const pageId = draftId ? draftPlace.pageId : searchParams.get('pageId');
  const backTo = draftId ? '/drafts' : communityId ? `/groups/${communityId}` : pageId ? `/pages/${pageId}` : '/';
  const textareaRef = useRef(null);
  const mention = useMentionAutocomplete();
  const token = localStorage.getItem('token');
  const photoCount = keptMedia.length + images.length;

  // Day 45: open the draft into the form.
  useEffect(() => {
    if (!draftId) return undefined;
    let cancelled = false;
    fetchDraft(draftId, token)
      .then((draft) => {
        if (cancelled) return;
        setContent(draft.content);
        setVisibility(draft.visibility);
        setKeptMedia(draft.media.map((m) => m.url));
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
    const room = MAX_IMAGES - photoCount;
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
  const removeKept = (url) => {
    setKeptMedia((current) => current.filter((u) => u !== url));
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

  // The form the server takes for a post and for a draft.
  const buildForm = (options, extra = {}) => {
    const formData = new FormData();
    formData.append('content', content);
    if (pollOn) formData.append('poll', JSON.stringify({ options, durationHours: pollHours }));
    if (communityId) formData.append('communityId', communityId);
    else if (pageId) formData.append('pageId', pageId);
    else formData.append('visibility', visibility);
    if (draftId) formData.append('keepMedia', JSON.stringify(keptMedia));
    for (const [key, value] of Object.entries(extra)) formData.append(key, value);
    images.forEach((img) => formData.append('images', img.file));
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

  const title = draftId ? t('drafts.editTitle') : communityId ? t('compose.inGroupTitle') : pageId ? t('compose.asPageTitle') : t('compose.title');
  const backLabel = draftId ? t('drafts.backToDrafts') : communityId ? t('compose.backToGroup') : pageId ? t('compose.backToPage') : t('common.backToHome');

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={backLabel} onClick={() => navigate(backTo)} />
        <h1 className="screen-header-title">{title}</h1>
        {!draftId && <IconButton icon={FileText} aria-label={t('drafts.open')} onClick={() => navigate('/drafts')} />}
      </header>
      {draftState === 'loading' && <p className="screen-status" role="status">{t('common.loading')}</p>}
      {draftState === 'missing' && (
        <div className="screen-body">
          <p className="form-error" role="alert">{t('drafts.notFound')}</p>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/drafts')}>{t('drafts.backToDrafts')}</button>
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
        {/* Day 44: a poll instead of photos (a poll post has none, like X). */}
        <button
          type="button"
          className="btn btn-secondary btn-sm compose-poll-toggle"
          onClick={() => { setPollOn((on) => !on); setError(''); }}
          disabled={submitting || (!pollOn && photoCount > 0)}
        >
          <ListChecks size={16} aria-hidden="true" /> {pollOn ? t('compose.removePoll') : t('compose.addPoll')}
        </button>
        {!pollOn && photoCount > 0 && <p className="form-hint">{t('compose.pollNoPhotos')}</p>}
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
            {keptMedia.map((url, i) => (
              <li key={url} className="image-picker-item">
                <img src={resolveImageUrl(url)} alt={t('compose.selectedImage', { n: i + 1 })} />
                <button
                  type="button"
                  className="image-picker-remove"
                  aria-label={t('compose.removeImage', { n: i + 1 })}
                  onClick={() => removeKept(url)}
                  disabled={submitting}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
            {images.map((img, i) => (
              <li key={img.preview} className="image-picker-item">
                <img src={img.preview} alt={t('compose.selectedImage', { n: keptMedia.length + i + 1 })} />
                <button
                  type="button"
                  className="image-picker-remove"
                  aria-label={t('compose.removeImage', { n: keptMedia.length + i + 1 })}
                  onClick={() => removeImage(i)}
                  disabled={submitting}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Day 45: schedule for later, in the person's own time zone. */}
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
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {scheduleOn
            ? (submitting ? t('drafts.scheduling') : t('drafts.schedule'))
            : (submitting ? t('compose.posting') : t('compose.post'))}
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={handleSaveDraft} disabled={submitting}>
          {t('drafts.saveDraft')}
        </button>
      </form>
      )}
    </div>
  );
}

export default CreatePost;
