import { getOptimizedImageUrl, getSrcSet } from '../../utils/cloudinaryImage';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CornerUpLeft, Flag, Forward, Pencil, SmilePlus } from 'lucide-react';
import MessageStatusIcon from './MessageStatusIcon';
import { MessageReactionChips, MessageReactionPicker } from './MessageReactions';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import { useTranslation } from 'react-i18next';
import i18n, { formatDate } from '../../i18n';
import LinkPreviewCard from '../common/LinkPreviewCard';
import { renderTextWithLinks } from '../../utils/renderTextWithLinks';
import { firstLink } from '../../utils/links';

const PROGRESS_BAR_DELAY_MS = 1000;
// Mirrors the backend's MESSAGE_EDIT_WINDOW_MS (messageService) -- the
// server enforces it; this only decides whether to offer "Edit".
const EDIT_WINDOW_MS = 15 * 60 * 1000;

// What a reply quote says about the original message (B9).
function quoteText(replyTo) {
  if (replyTo.deleted) return i18n.t('messages.quoteDeleted');
  if (replyTo.type === 'image') return replyTo.content ? i18n.t('messages.preview.photoCaption', { caption: replyTo.content }) : i18n.t('messages.preview.photo');
  if (replyTo.type === 'voice') return i18n.t('messages.preview.voice');
  return replyTo.content;
}

// Inline edit form (B9) -- replaces the bubble's text while editing.
function EditForm({ message, onSave, onCancel }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(message.content || '');
  return (
    <form
      className="messages-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSave(message.id, value);
      }}
    >
      <label className="feed-visually-hidden" htmlFor={`edit-message-${message.id}`}>
        {t('messages.editMessage')}
      </label>
      <input
        id={`edit-message-${message.id}`}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
      />
      <div className="messages-edit-actions">
        <button type="button" className="messages-link-btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="messages-link-btn messages-link-btn-strong" disabled={!value.trim()}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

// Memoized: a status-update/ack for ONE message otherwise re-renders every
// bubble in the thread, since they all receive a new `messages` array
// reference from the same setState call. mergeMessages/status handlers only
// create a new object for the message that actually changed (see
// useConversationMessages), so a reference-equality check here is enough to
// skip the rest. (Handlers passed in must be stable -- Conversation passes
// useCallback'd ones.)
function MessageBubble({
  message,
  isOwn,
  replyAuthorLabel,
  senderName,
  isEditing,
  onRetry,
  onRetryVoice,
  onRetryImage,
  onDelete,
  onReply,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onReport,
  onReact,
  onForward,
  currentUserId
}) {
  const { t } = useTranslation();
  const isFailed = message.status === 'failed';
  const isDeleted = Boolean(message.deleted_at);
  const isVoice = message.type === 'voice';
  const isImage = message.type === 'image';
  const isSending = message.status === 'sending';
  const isPersisted = message.id != null && !isSending && !isFailed;

  // Only surfaced once an upload has actually been in flight for a second --
  // a fast upload finishing well under that shouldn't flash a progress bar.
  const [showProgress, setShowProgress] = useState(false);
  useEffect(() => {
    if (!(isVoice || isImage) || !isSending) return;
    const timeoutId = setTimeout(() => setShowProgress(true), PROGRESS_BAR_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [isVoice, isImage, isSending, message.client_temp_id]);

  // Only a real, persisted, not-yet-deleted message the current user sent
  // can be deleted.
  const canDelete = isOwn && !isDeleted && isPersisted;
  const canReply = !isDeleted && isPersisted;
  // Day 12: someone else's message can be reported to the moderators.
  const canReport = !isOwn && !isDeleted && isPersisted && Boolean(onReport);
  // Day 31: reactions (see MessageReactions.jsx). replyAuthorLabel doubles
  // as "who is this" for the reactions label ("You", a name, or "them").
  const canReact = !isDeleted && isPersisted && Boolean(onReact);
  // Day 32: forward to other chats (ForwardSheet, opened by the parent).
  const canForward = !isDeleted && isPersisted && Boolean(onForward);
  const reactions = isDeleted ? [] : message.reactions || [];
  const myReaction = reactions.find((x) => x.user_id === currentUserId)?.reaction || null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactButtonRef = useRef(null);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  // Whether the 15-minute edit window is still open -- state + a timer (not
  // Date.now() during render) so "Edit" disappears exactly when it closes.
  const isEditableType = isOwn && message.type !== 'voice' && message.type !== 'image';
  const [inEditWindow, setInEditWindow] = useState(false);
  useEffect(() => {
    if (!isEditableType) return undefined;
    const remaining = new Date(message.created_at).getTime() + EDIT_WINDOW_MS - Date.now();
    // Deferred like the rest of this codebase's effect-driven state updates
    // (never a synchronous setState inside the effect body).
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setInEditWindow(remaining > 0);
    });
    if (remaining <= 0) {
      return () => {
        cancelled = true;
      };
    }
    const timeoutId = setTimeout(() => setInEditWindow(false), remaining);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isEditableType, message.created_at]);
  const canEdit = isEditableType && inEditWindow && !isDeleted && isPersisted;

  let body;
  if (isDeleted) {
    body = (
      <p className="messages-bubble-text">
        <em>{t('messages.preview.deleted')}</em>
      </p>
    );
  } else if (isEditing) {
    body = <EditForm message={message} onSave={onSaveEdit} onCancel={onCancelEdit} />;
  } else if (isVoice) {
    body = (
      <VoiceMessagePlayer
        src={message.media_url}
        durationSeconds={message.duration_seconds}
        seedKey={message.id ?? message.client_temp_id}
      />
    );
  } else if (isImage) {
    body = (
      <>
        <a href={message.media_url} target="_blank" rel="noreferrer" className="messages-image-link" aria-label={t('messages.openPhoto')}>
          {/* Day 27: at most 260px wide on screen; the link still opens the original. */}
          <img
            src={getOptimizedImageUrl(message.media_url, 520)}
            srcSet={getSrcSet(message.media_url, [260, 520, 780]) || undefined}
            sizes="260px"
            alt={message.content ? t('messages.preview.photoCaption', { caption: message.content }) : t('messages.preview.photo')}
            className="messages-image"
            loading="lazy"
            decoding="async"
          />
        </a>
        {message.content && <p className="messages-bubble-text" dir="auto">{renderTextWithLinks(message.content, { tags: false })}</p>}
      </>
    );
  } else {
    // Day 19: links are clickable, and the first one gets a preview card
    // (once the message is really sent).
    body = (
      <>
        <p className="messages-bubble-text" dir="auto">{renderTextWithLinks(message.content || '', { tags: false })}</p>
        {isPersisted && <LinkPreviewCard url={firstLink(message.content)} className="link-preview-in-message" />}
      </>
    );
  }

  return (
    <div className={`messages-bubble-row${isOwn ? ' messages-bubble-row-own' : ''}${reactions.length ? ' messages-bubble-row-reacted' : ''}`}>
      {pickerOpen && canReact && (
        <MessageReactionPicker
          myReaction={myReaction}
          onPick={(reaction) => onReact(message.id, reaction)}
          onClose={closePicker}
          returnFocusRef={reactButtonRef}
        />
      )}
      <div
        className={[
          'messages-bubble',
          isOwn ? 'messages-bubble-own' : 'messages-bubble-other',
          isImage && !isDeleted ? 'messages-bubble-image' : '',
          isSending ? 'messages-bubble-sending' : '',
          isFailed ? 'messages-bubble-failed' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {canDelete && !isEditing && (
          <button
            type="button"
            className="messages-bubble-delete-btn"
            onClick={() => onDelete(message.id)}
            aria-label={t('messages.deleteMessage')}
            title={t('messages.deleteMessage')}
          >
            &times;
          </button>
        )}
        {/* B10: in a group, others' bubbles say who sent them. */}
        {senderName && <span className="messages-sender-name">{senderName}</span>}
        {message.is_forwarded && !isDeleted && (
          <span className="messages-forwarded-label">
            <Forward size={12} aria-hidden="true" />
            {t('messages.forwarded')}
          </span>
        )}
        {message.reply_to && !isDeleted && (
          <div className="messages-reply-quote">
            <span className="messages-reply-quote-author">{replyAuthorLabel(message.reply_to.sender_id)}</span>
            <span className="messages-reply-quote-text" dir="auto">{quoteText(message.reply_to)}</span>
          </div>
        )}
        {body}
        {(isVoice || isImage) && isSending && showProgress && (
          <div
            className="messages-bubble-upload-progress"
            role="progressbar"
            aria-valuenow={message._uploadProgress || 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={isImage ? t('messages.uploadingPhoto') : t('messages.uploadingVoice')}
          >
            <div className="messages-bubble-upload-progress-fill" style={{ width: `${message._uploadProgress || 0}%` }} />
          </div>
        )}
        <div className="messages-bubble-meta">
          {message.edited_at && !isDeleted && <span className="messages-edited">{t('messages.edited')}</span>}
          <time dateTime={message.created_at} title={formatDate(message.created_at)}>
            {formatDate(message.created_at, 'time')}
          </time>
          {isOwn && !isFailed && <MessageStatusIcon status={message.status} />}
        </div>
        {isFailed && isVoice && (
          <button
            type="button"
            className="messages-retry-btn"
            onClick={() => onRetryVoice(message.client_temp_id, message._voiceBlob, message.duration_seconds)}
          >
            {t('messages.voiceFailed')}
          </button>
        )}
        {isFailed && isImage && (
          <button
            type="button"
            className="messages-retry-btn"
            onClick={() => onRetryImage(message.client_temp_id, message._imageFile, message.reply_to)}
          >
            {t('messages.photoFailed')}
          </button>
        )}
        {isFailed && !isVoice && !isImage && (
          <button
            type="button"
            className="messages-retry-btn"
            onClick={() => onRetry(message.client_temp_id, message.content, message.reply_to)}
          >
            {t('messages.sendFailed')}
          </button>
        )}
        <MessageReactionChips reactions={reactions} nameOf={replyAuthorLabel} onOpen={canReact ? () => setPickerOpen(true) : undefined} />
      </div>
      {(canReply || canEdit || canReport || canReact || canForward) && !isEditing && (
        <div className="messages-bubble-actions">
          {canReact && (
            <button
              type="button"
              ref={reactButtonRef}
              className="messages-action-btn"
              onClick={() => setPickerOpen((open) => !open)}
              aria-label={t('messages.react')}
              title={t('messages.react')}
              aria-expanded={pickerOpen}
            >
              <SmilePlus size={14} aria-hidden="true" />
            </button>
          )}
          {canReply && (
            <button type="button" className="messages-action-btn" onClick={() => onReply(message)} aria-label={t('messages.replyToMessage')}>
              <CornerUpLeft size={14} aria-hidden="true" />
            </button>
          )}
          {canForward && (
            <button type="button" className="messages-action-btn" onClick={() => onForward(message)} aria-label={t('messages.forward')} title={t('messages.forward')}>
              <Forward size={14} aria-hidden="true" />
            </button>
          )}
          {canEdit && (
            <button type="button" className="messages-action-btn" onClick={() => onStartEdit(message.id)} aria-label={t('messages.editMessage')}>
              <Pencil size={13} aria-hidden="true" />
            </button>
          )}
          {canReport && (
            <button type="button" className="messages-action-btn" onClick={() => onReport(message)} aria-label={t('messages.reportMessage')} title={t('messages.reportMessage')}>
              <Flag size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
