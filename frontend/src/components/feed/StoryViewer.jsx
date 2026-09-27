import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { arrowStep } from '../../utils/direction';
import { useTranslation } from 'react-i18next';
import { Avatar, ConfirmDialog } from '../ui';
import { resolveImageUrl } from '../../api';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
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
function StoryViewer({ tray, startGroupIndex, onClose, onViewed, onDelete }) {
  const { t } = useTranslation();
  const [groupIndex, setGroupIndex] = useState(startGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const closeButtonRef = useRef(null);
  const openerRef = useRef(null);

  const group = tray[groupIndex];
  const story = group?.stories[storyIndex];

  const goTo = useCallback((nextGroup, nextStory) => {
    setGroupIndex(nextGroup);
    setStoryIndex(nextStory);
    setLoaded(false);
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

  // Auto-advance once the image is showing (paused while confirming delete).
  useEffect(() => {
    if (!loaded || confirmOpen) return undefined;
    const timer = setTimeout(next, STORY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [loaded, confirmOpen, next, groupIndex, storyIndex]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (confirmOpen) return;
      if (e.key === 'Escape') onClose();
      else if (arrowStep(e.key) === 1) next();
      else if (arrowStep(e.key) === -1) prev();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmOpen, next, prev, onClose]);

  if (!group || !story) return null;

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
                  i === storyIndex && confirmOpen && 'is-paused'
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
          src={resolveImageUrl(story.media_url)}
          alt={t('stories.alt', { n: storyIndex + 1, count: group.stories.length, name: group.username })}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />

        <button type="button" className="story-viewer-tap story-viewer-tap-prev" aria-label={t('stories.prev')} onClick={prev} />
        <button type="button" className="story-viewer-tap story-viewer-tap-next" aria-label={t('stories.next')} onClick={next} />
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
