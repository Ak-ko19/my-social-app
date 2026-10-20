// Single/double check-mark icons for the sender's own message status --
// deliberately plain inline SVG (no icon library in this project). 'sending'
// renders the shared CSS spinner instead of a checkmark, and Day 72's
// 'queued' (written offline, sent when the connection is back) a clock;
// 'failed' is handled by the bubble itself (a Retry button), not this component.
import { useTranslation } from 'react-i18next';

function MessageStatusIcon({ status }) {
  const { t } = useTranslation();
  if (status === 'sending') {
    return <span className="messages-spinner" role="status" aria-label={t('messages.status.sending')} />;
  }

  if (status === 'queued') {
    return (
      <svg className="messages-status-icon" viewBox="0 0 16 16" width="14" height="14" aria-label={t('messages.status.queued')} role="img">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === 'sent') {
    return (
      <svg
        className="messages-status-icon"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-label={t('messages.status.sent')}
        role="img"
      >
        <path
          d="M2 8.5 6 12l8-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === 'delivered' || status === 'read') {
    return (
      <svg
        className={`messages-status-icon ${status === 'read' ? 'messages-status-icon-read' : ''}`.trim()}
        viewBox="0 0 20 16"
        width="18"
        height="14"
        aria-label={status === 'read' ? t('messages.status.read') : t('messages.status.delivered')}
        role="img"
      >
        <path
          d="M1 8.5 5 12l8-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 8.5 11 12l8-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return null;
}

export default MessageStatusIcon;
