import { memo, useEffect, useState } from 'react';
import MessageStatusIcon from './MessageStatusIcon';
import VoiceMessagePlayer from './VoiceMessagePlayer';

const PROGRESS_BAR_DELAY_MS = 1000;

// Memoized: a status-update/ack for ONE message otherwise re-renders every
// bubble in the thread, since they all receive a new `messages` array
// reference from the same setState call. mergeMessages/status handlers only
// create a new object for the message that actually changed (see
// useConversationMessages), so a reference-equality check here is enough to
// skip the rest.
function MessageBubble({ message, isOwn, onRetry, onRetryVoice, onDelete }) {
  const isFailed = message.status === 'failed';
  const isDeleted = Boolean(message.deleted_at);
  const isVoice = message.type === 'voice';
  const isSending = message.status === 'sending';

  // Only surfaced once an upload has actually been in flight for a second --
  // a fast upload finishing well under that shouldn't flash a progress bar
  // just to immediately replace it with the real bubble. Gated by isSending
  // in the render below too (not just here), so a lingering `true` from
  // before a failure can't show a progress bar on a failed bubble -- this
  // same message object stays mounted (same key) across sending -> failed,
  // unlike sending -> sent, which swaps in a differently-keyed real row.
  const [showProgress, setShowProgress] = useState(false);
  useEffect(() => {
    if (!isVoice || !isSending) return;
    const timeoutId = setTimeout(() => setShowProgress(true), PROGRESS_BAR_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [isVoice, isSending, message.client_temp_id]);
  // Only a real, persisted, not-yet-deleted message the current user sent
  // can be deleted -- an optimistic row (no id yet) has nothing on the
  // server yet to delete, and a 'failed' row already has its own retry
  // affordance instead.
  const canDelete = isOwn && !isDeleted && message.id != null && message.status !== 'sending' && !isFailed;

  return (
    <div className={`messages-bubble-row${isOwn ? ' messages-bubble-row-own' : ''}`}>
      <div
        className={[
          'messages-bubble',
          isOwn ? 'messages-bubble-own' : 'messages-bubble-other',
          message.status === 'sending' ? 'messages-bubble-sending' : '',
          isFailed ? 'messages-bubble-failed' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {canDelete && (
          <button
            type="button"
            className="messages-bubble-delete-btn"
            onClick={() => onDelete(message.id)}
            aria-label="Delete message"
            title="Delete message"
          >
            &times;
          </button>
        )}
        {isDeleted ? (
          <p className="messages-bubble-text">
            <em>This message was deleted</em>
          </p>
        ) : isVoice ? (
          // media_url is a local blob: URL while status is 'sending'/'failed'
          // (see useConversationMessages.sendVoiceMessage), and the real
          // Cloudinary URL once persisted -- VoiceMessagePlayer plays either
          // one identically, and works the same whether this message came
          // from REST pagination or arrived live via new_message.
          <VoiceMessagePlayer
            src={message.media_url}
            durationSeconds={message.duration_seconds}
            seedKey={message.id ?? message.client_temp_id}
          />
        ) : (
          <p className="messages-bubble-text">{message.content}</p>
        )}
        {isVoice && isSending && showProgress && (
          <div
            className="messages-bubble-upload-progress"
            role="progressbar"
            aria-valuenow={message._uploadProgress || 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Uploading voice message"
          >
            <div
              className="messages-bubble-upload-progress-fill"
              style={{ width: `${message._uploadProgress || 0}%` }}
            />
          </div>
        )}
        <div className="messages-bubble-meta">
          <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
          {isOwn && !isFailed && <MessageStatusIcon status={message.status} />}
        </div>
        {isFailed && isVoice && (
          <button
            type="button"
            className="messages-retry-btn"
            onClick={() => onRetryVoice(message.client_temp_id, message._voiceBlob, message.duration_seconds)}
          >
            Voice message failed to send · Retry
          </button>
        )}
        {isFailed && !isVoice && (
          <button
            type="button"
            className="messages-retry-btn"
            onClick={() => onRetry(message.client_temp_id, message.content)}
          >
            Failed to send · Retry
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
