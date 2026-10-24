import { useTranslation } from 'react-i18next';
import { useOnline } from '../../hooks/useOnline';
import { useRetryWhenOnline } from '../../hooks/useRetryWhenOnline';

// Day 80: offline, it says so (not "failed to load conversations") and
// tries again by itself when the connection is back.
function ConversationListErrorState({ message, onRetry }) {
  const { t } = useTranslation();
  const online = useOnline();
  useRetryWhenOnline(online, onRetry);
  return (
    <div className="messages-error-state" role="alert">
      <p>{online ? message : t('errors.offlineRetry')}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="messages-btn">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export default ConversationListErrorState;
