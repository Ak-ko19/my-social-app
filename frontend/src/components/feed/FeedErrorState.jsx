import { useTranslation } from 'react-i18next';
import { useOnline } from '../../hooks/useOnline';
import { useRetryWhenOnline } from '../../hooks/useRetryWhenOnline';

// Day 80: offline, it says so (not the screen's "failed to load") and
// tries again by itself when the connection is back.
function FeedErrorState({ message, onRetry }) {
  const { t } = useTranslation();
  const online = useOnline();
  useRetryWhenOnline(online, onRetry);
  return (
    <div className="feed-error-state" role="alert">
      <p>{online ? message : t('errors.offlineRetry')}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="feed-btn">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export default FeedErrorState;
