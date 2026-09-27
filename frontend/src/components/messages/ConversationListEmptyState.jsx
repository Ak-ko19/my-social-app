import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// No dedicated "start a conversation" flow exists yet -- Search is the
// existing entry point for finding another user, so the CTA points there.
function ConversationListEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="messages-empty-state" role="status">
      <p>{t('messages.noConversations')}</p>
      <p>
        <Link to="/search" className="messages-btn-link">
          {t('messages.findSomeone')}
        </Link>
      </p>
    </div>
  );
}

export default ConversationListEmptyState;
