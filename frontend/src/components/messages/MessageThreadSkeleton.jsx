// Initial-load skeleton for the whole thread: alternating left/right bubble
// shapes of varying width, hinting at the real layout without a uniform
// repeated block. Mirrors FeedSkeleton/ConversationListSkeleton's approach.
import { useTranslation } from 'react-i18next';

function MessageThreadSkeleton() {
  const { t } = useTranslation();
  const widths = [45, 60, 35, 55, 40];
  return (
    <div className="messages-thread" role="status" aria-label={t('messages.loadingConversation')}>
      {widths.map((width, i) => (
        <div key={i} className={`messages-bubble-row${i % 2 === 1 ? ' messages-bubble-row-own' : ''}`}>
          <div
            className="messages-bubble-skeleton messages-skeleton-pulse"
            style={{ width: `${width}%` }}
            aria-hidden="true"
          />
        </div>
      ))}
      <span className="messages-visually-hidden">{t('messages.loadingConversationDots')}</span>
    </div>
  );
}

export default MessageThreadSkeleton;
