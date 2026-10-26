import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { arrowStep } from '../../utils/direction';
import { useTranslation } from 'react-i18next';
import { Avatar, ConfirmDialog } from '../ui';
import { resolveImageUrl } from '../../api';
import { getOptimizedImageUrl, getSrcSet } from '../../utils/cloudinaryImage';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { serverErrorText } from '../../utils/serverError';
import { STORY_REACTIONS } from './storyReactions';
import './StoryViewer.css';

const STORY_DURATION_MS = 5000;

// Full-screen story player (B3). Walks the tray in order: every story of
// the opened person, then on to the next person, closing after the last.
// - Each story shows for STORY_DURATION_MS, timed from when its image has
//   loaded (a slow network doesn't eat into viewing time).
// - Tap the left third / right two-thirds, or Left/Right arrows, to step;
//   Escape or the X closes. Focus starts on the close button and returns
//   to whatever opened the viewer.
// - Each story is marked seen when shown. Your own stories get a delete
//   button; the timer pauses while its confirmation is open.
// - Day 100: someone else's story (when they take messages from you) has a
//   reply box and quick reactions, sent to them as a message (onReply).
//   The timer pauses while you type or send; arrows typed in the box move
//   the caret, not the story.
const SENT_NOTE_MS = 2000;

function StoryViewer({ tray, startGroupIndex, onClose, onViewed, onDelete, onReply }) {
  const { t } = useTranslation();
  const [groupIndex, setGroupIndex] = useState(startGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replyFocused, setReplyFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState(false);
  const [replyError, setReplyError] = useState(null);
  const closeButtonRef = useRef(null);
  const openerRef = useRef(null);

  const group = tray[groupIndex];
  const story = group?.stories[storyIndex];
  const canReply = Boolean(onReply && group && !group.is_own && group.can_reply);
  const paused = confirmOpen || replyFocused || sending || replyText.trim() !== '';

  const goTo = useCallback((nextGroup, nextStory) => {
    setGroupIndex(nextGroup);
    setStoryIndex(nextStory);
    setLoaded(false);
    // A reply is to the story it was typed on: a new story starts empty.
    setReplyText('');
    setReplyError(null);
    setSentNote(false);
  }, []);

  const next = useCallback(() => {
    if (!group) return;
    if (storyIndex < group.stories.length - 1) goTo(groupIndex, storyIndex + 1);
    else if (groupIndex < tray.length - 1) goTo(groupIndex + 1, 0);
    else onClose();
  }, [group, storyIndex, groupIndex, tray.length, goTo, onClose]);

  const prev = useCallback(() => {
    if (storyIndex > 0) goTo(groupIndex, storyIndex - 1);
    else if (groupIndex > 0) goTo(groupIndex - 1, tray[groupIndex - 1].stories.length - 1);
    else goTo(groupIndex, 0); // first story overall: just restart it
  }, [storyIndex, groupIndex, tray, goTo]);

  // Focus in on open, back to the opener on close.
  useEffect(() => {
    openerRef.current = document.activeElement;
    closeButtonRef.current?.focus();
    const opener = openerRef.current;
    return () => opener?.focus?.();
  }, []);

  // Seen as soon as it's on screen.
  useEffect(() => {
    if (story && !story.seen) onViewed(story.id);
  }, [story, onViewed]);

  // Auto-advance once the image is showing (paused while confirming
  // delete, or while replying).
  useEffect(() => {
    if (!loaded || paused) return undefined;
    const timer = setTimeout(next, STORY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [loaded, paused, next, groupIndex, storyIndex]);

  useEffect(() => {
    if (!sentNote) return undefined;
    const timer = setTimeout(() => setSentNote(false), SENT_NOTE_MS);
    return () => clearTimeout(timer);
  }, [sentNote]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (confirmOpen) return;
      if (e.key === 'Escape') onClose();
      // Typing a reply: the arrows move the caret.
      else if (e.target instanceof HTMLInputElement) return;
      else if (arrowStep(e.key) === 1) next();
      else if (arrowStep(e.key) === -1) prev();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmOpen, next, prev, onClose]);

  if (!group || !story) return null;

  // { text } or { emoji }. One at a time (a second tap while sending does
  // nothing); the text stays if it fails.
  const sendReply = async (payload) => {
    if (sending) return;
    setSending(true);
    setReplyError(null);
    setSentNote(false);
    try {
      await onReply(story.id, payload);
      if (payload.text !== undefined) setReplyText('');
      setSentNote(true);
    } catch (err) {
      console.error(err);
      setReplyError(serverErrorText(err, 'stories.replyFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleReplySubmit = (e) => {
    e.preventDefault();
    const text = replyText.trim();
    if (text) sendReply({ text });
  };

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await onDelete(story.id);
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      console.error(err);
      setDeleteError(t('stories.deleteFailed'));
    }
  };

  return createPortal(
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={t('stories.label', { name: group.username })}>
      <div className="story-viewer-frame">
        <div className="story-viewer-progress" aria-hidden="true">
          {group.stories.map((s, i) => (
            <span key={s.id} className="story-viewer-segment">
              <span
                // Re-keyed per story so the fill animation restarts.
                key={`${s.id}-${i === storyIndex ? `${groupIndex}-${storyIndex}` : 'idle'}`}
                className={clsx(
                  'story-viewer-segment-fill',
                  i < storyIndex && 'is-done',
                  i === storyIndex && loaded && 'is-active',
                  i === storyIndex && paused && 'is-paused'
                )}
                style={{ animationDuration: `${STORY_DURATION_MS}ms` }}
              />
            </span>
          ))}
        </div>

        <header className="story-viewer-header">
          <Avatar size={32} src={resolveImageUrl(group.avatar_url)} initials={(group.username || '?').slice(0, 2).toUpperCase()} alt="" />
          <span className="story-viewer-name">{group.is_own ? t('stories.yours') : group.username}</span>
          <span className="story-viewer-time">{formatRelativeTime(story.created_at)}</span>
          <span className="story-viewer-spacer" />
          {group.is_own && (
            <button type="button" className="story-viewer-icon-btn" aria-label={t('stories.deleteThis')} onClick={() => setConfirmOpen(true)}>
              <Trash2 size={18} aria-hidden="true" />
            </button>
          )}
          <button ref={closeButtonRef} type="button" className="story-viewer-icon-btn" aria-label={t('stories.close')} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <img
          key={story.id}
          className={clsx('story-viewer-image', loaded && 'is-loaded')}
          // Day 27: sized for the frame (at most 480px wide), not the upload.
          src={getOptimizedImageUrl(resolveImageUrl(story.media_url), 1080)}
          srcSet={getSrcSet(resolveImageUrl(story.media_url), [480, 720, 1080, 1440]) || undefined}
          sizes="(max-width: 480px) 100vw, 480px"
          decoding="async"
          alt={t('stories.alt', { n: storyIndex + 1, count: group.stories.length, name: group.username })}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />

        <button type="button" className="story-viewer-tap story-viewer-tap-prev" aria-label={t('stories.prev')} onClick={prev} />
        <button type="button" className="story-viewer-tap story-viewer-tap-next" aria-label={t('stories.next')} onClick={next} />

        {canReply && (
          <div className="story-viewer-reply">
            <div className="story-viewer-reactions" role="group" aria-label={t('stories.reactionsLabel')}>
              {STORY_REACTIONS.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  className="story-viewer-reaction"
                  aria-label={t(`stories.reactions.${r.name}`)}
                  disabled={sending}
                  onClick={() => sendReply({ emoji: r.emoji })}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                </button>
              ))}
            </div>
            <form className="story-viewer-reply-form" onSubmit={handleReplySubmit}>
              <input
                type="text"
                className="story-viewer-reply-input"
                dir="auto"
                maxLength={5000}
                value={replyText}
                placeholder={t('stories.replyPlaceholder', { name: group.username })}
                aria-label={t('stories.replyLabel', { name: group.username })}
                onChange={(e) => setReplyText(e.target.value)}
                onFocus={() => setReplyFocused(true)}
                onBlur={() => setReplyFocused(false)}
              />
              <button type="submit" className="story-viewer-icon-btn" aria-label={t('stories.sendReply')} disabled={sending || !replyText.trim()}>
                <Send size={20} aria-hidden="true" />
              </button>
            </form>
            <p className="story-viewer-reply-status" role="status">
              {sentNote ? t('stories.replySent') : ''}
            </p>
            {replyError && (
              <p className="story-viewer-reply-error" role="alert">
                {replyError}
              </p>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setDeleteError(null);
        }}
        onConfirm={handleDelete}
        title={t('stories.deleteTitle')}
        description={t('stories.deleteDescription')}
        confirmLabel={t('common.delete')}
        danger
        error={deleteError}
      />
    </div>,
    document.body
  );
}

export default StoryViewer;
