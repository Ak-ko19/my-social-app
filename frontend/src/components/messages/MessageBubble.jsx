import { memo } from 'react';
import MessageStatusIcon from './MessageStatusIcon';

// Memoized: a status-update/ack for ONE message otherwise re-renders every
// bubble in the thread, since they all receive a new `messages` array
// reference from the same setState call. mergeMessages/status handlers only
// create a new object for the message that actually changed (see
// useConversationMessages), so a reference-equality check here is enough to
// skip the rest.
function MessageBubble({ message, isOwn, onRetry }) {
  const isFailed = message.status === 'failed';

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
        <p className="messages-bubble-text">
          {message.deleted_at ? <em>This message was deleted</em> : message.content}
        </p>
        <div className="messages-bubble-meta">
          <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
          {isOwn && !isFailed && <MessageStatusIcon status={message.status} />}
        </div>
        {isFailed && (
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
