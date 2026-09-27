import { memo, useEffect, useState } from 'react';
import { CornerUpLeft, Pencil } from 'lucide-react';
import MessageStatusIcon from './MessageStatusIcon';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import { useTranslation } from 'react-i18next';
import i18n, { formatDate } from '../../i18n';

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
  onCancelEdit
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
          <img src={message.media_url} alt={message.content ? t('messages.preview.photoCaption', { caption: message.content }) : t('messages.preview.photo')} className="messages-image" loading="lazy" />
        </a>
        {message.content && <p className="messages-bubble-text">{message.content}</p>}
      </>
    );
  } else {
    body = <p className="messages-bubble-text">{message.content}</p>;
  }

  return (
    <div className={`messages-bubble-row${isOwn ? ' messages-bubble-row-own' : ''}`}>
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
        {message.reply_to && !isDeleted && (
          <div className="messages-reply-quote">
            <span className="messages-reply-quote-author">{replyAuthorLabel(message.reply_to.sender_id)}</span>
            <span className="messages-reply-quote-text">{quoteText(message.reply_to)}</span>
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
      </div>
      {(canReply || canEdit) && !isEditing && (
        <div className="messages-bubble-actions">
          {canReply && (
            <button type="button" className="messages-action-btn" onClick={() => onReply(message)} aria-label={t('messages.replyToMessage')}>
              <CornerUpLeft size={14} aria-hidden="true" />
            </button>
          )}
          {canEdit && (
            <button type="button" className="messages-action-btn" onClick={() => onStartEdit(message.id)} aria-label={t('messages.editMessage')}>
              <Pencil size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
