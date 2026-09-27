import { useTranslation } from 'react-i18next';

function FeedErrorState({ message, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="feed-error-state" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="feed-btn">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export default FeedErrorState;
