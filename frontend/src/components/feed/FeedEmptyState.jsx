import { useTranslation } from 'react-i18next';

function FeedEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="feed-empty-state" role="status">
      <p>{t('feed.empty')}</p>
    </div>
  );
}

export default FeedEmptyState;
