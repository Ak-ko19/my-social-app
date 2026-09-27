import ConversationListItemSkeleton from './ConversationListItemSkeleton';
import { useTranslation } from 'react-i18next';

// Initial-load skeleton: a handful of rows, mirroring FeedSkeleton's shape.
function ConversationListSkeleton({ count = 6 }) {
  const { t } = useTranslation();
  return (
    <div className="messages-skeleton-list" role="status" aria-label={t('messages.loadingConversations')}>
      {Array.from({ length: count }).map((_, i) => (
        <ConversationListItemSkeleton key={i} />
      ))}
      <span className="messages-visually-hidden">{t('messages.loadingConversationsDots')}</span>
    </div>
  );
}

export default ConversationListSkeleton;
