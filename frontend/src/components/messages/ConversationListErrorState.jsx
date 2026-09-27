import { useTranslation } from 'react-i18next';

function ConversationListErrorState({ message, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="messages-error-state" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="messages-btn">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export default ConversationListErrorState;
