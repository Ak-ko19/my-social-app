import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAuth } from './hooks/useAuth';
import { useConversations } from './hooks/useConversations';
import { usePresenceEvents } from './hooks/usePresenceEvents';
import ConversationList from './components/messages/ConversationList';
import ConversationListSkeleton from './components/messages/ConversationListSkeleton';
import ConversationListEmptyState from './components/messages/ConversationListEmptyState';
import ConversationListErrorState from './components/messages/ConversationListErrorState';
import { DURATION_NORMAL, EASE_STANDARD } from './utils/motionTokens';
import './components/messages/Messages.css';

function Messages() {
  const navigate = useNavigate();
  const { token, userId } = useAuth();
  const { conversations, loading, error, reload } = useConversations(token, userId);
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
    <div style={{ padding: '20px' }}>
      <h2>Messages</h2>
      <p><a href="/">Back to Feed</a></p>

      <AnimatePresence initial={false}>
        <motion.div
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
            <ConversationList
              conversations={conversations}
              onlineUserIds={onlineUserIds}
              onOpenConversation={openConversation}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default Messages;
