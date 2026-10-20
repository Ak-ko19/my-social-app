import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Users } from 'lucide-react';
import { IconButton } from './components/ui';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useAuth } from './hooks/useAuth';
import { useConversations } from './hooks/useConversations';
import { usePresenceEvents } from './hooks/usePresenceEvents';
import ConversationList from './components/messages/ConversationList';
import ConversationListSkeleton from './components/messages/ConversationListSkeleton';
import ConversationListEmptyState from './components/messages/ConversationListEmptyState';
import ConversationListErrorState from './components/messages/ConversationListErrorState';
import ConnectionBanner from './components/messages/ConnectionBanner';
import { DURATION_NORMAL, EASE_STANDARD } from './utils/motionTokens';
import './components/messages/Messages.css';
import { useTranslation } from 'react-i18next';

function Messages() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token, userId } = useAuth();
  const { conversations, loading, error, reload, nextCursor, loadMore, loadingMore } = useConversations(token, userId);
  const { isOnline } = usePresenceEvents();
  const reduceMotion = useReducedMotion();

  // ConversationList/ConversationListItem just consume a plain Set (their
  // interface hasn't changed since the presence stub) -- the merge of each
  // row's own REST-fetched baseline (is_online) with live user_online/
  // user_offline deltas happens once, here.
  const onlineUserIds = new Set(
    conversations.filter((c) => isOnline(c.other_user_id, c.is_online)).map((c) => c.other_user_id)
  );

  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  if (!token) {
    return null;
  }

  const openConversation = (conversation) => {
    // Passed as navigation state so Conversation.jsx has the other
    // participant's name/avatar to show immediately, without waiting on a
    // second request just to render its header.
    navigate(`/messages/${conversation.conversation_id}`, { state: { conversation } });
  };

  // Same one-time crossfade pattern as Feed.jsx -- keyed on the coarse
  // loading/error/empty/list state, not on `conversations` itself, so a
  // live in-place update (new message moving a row to the top) never
  // re-triggers this transition.
  const inboxState = loading ? 'loading' : error ? 'error' : conversations.length === 0 ? 'empty' : 'list';

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToHome')} onClick={() => navigate('/')} />
        <h1 className="screen-header-title">{t('messages.title')}</h1>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/messages/new-group')}>
          <Users size={14} aria-hidden="true" /> {t('messages.newGroup')}
        </button>
      </header>
      <div className="screen-body">
      <ConnectionBanner />

      <AnimatePresence initial={false}>
        <m.div
          key={inboxState}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : DURATION_NORMAL, ease: EASE_STANDARD }}
        >
          {inboxState === 'loading' && <ConversationListSkeleton />}
          {inboxState === 'error' && <ConversationListErrorState message={error} onRetry={reload} />}
          {inboxState === 'empty' && <ConversationListEmptyState />}
          {inboxState === 'list' && (
            <>
              <ConversationList
                conversations={conversations}
                onlineUserIds={onlineUserIds}
                onOpenConversation={openConversation}
              />
              {nextCursor && (
                <div className="messages-load-more">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? t('common.loading') : t('common.loadMore')}
                  </button>
                </div>
              )}
            </>
          )}
        </m.div>
      </AnimatePresence>
      </div>
    </div>
  );
}

export default Messages;
