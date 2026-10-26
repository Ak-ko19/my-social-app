import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Pin, PinOff, Users } from 'lucide-react';
import { ActionSheet, IconButton } from './components/ui';
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

// Days 97-98: archived -- the same screen for "Archived chats"
// (/messages/archived).
function Messages({ archived = false }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token, userId } = useAuth();
  const {
    conversations, loading, error, reload, nextCursor, loadMore, loadingMore, archivedCount, organise, actionError
  } = useConversations(token, userId, { archived });
  // The chat whose "More options" sheet is open.
  const [optionsFor, setOptionsFor] = useState(null);
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
  const options = optionsFor ? [
    optionsFor.pinned
      ? { key: 'unpin', label: t('messages.organise.unpin'), icon: PinOff, onSelect: () => organise(optionsFor, { pinned: false }) }
      : { key: 'pin', label: t('messages.organise.pin'), icon: Pin, onSelect: () => organise(optionsFor, { pinned: true }) },
    optionsFor.archived
      ? { key: 'unarchive', label: t('messages.organise.unarchive'), icon: ArchiveRestore, onSelect: () => organise(optionsFor, { archived: false }) }
      : { key: 'archive', label: t('messages.organise.archive'), icon: Archive, onSelect: () => organise(optionsFor, { archived: true }) }
  ] : [];

  return (
    <div className="screen-enter">
      <header className="screen-header">
        {archived
          ? <IconButton icon={ChevronLeft} aria-label={t('messages.organise.backToMessages')} onClick={() => navigate('/messages')} />
          : <IconButton icon={ChevronLeft} aria-label={t('common.backToHome')} onClick={() => navigate('/')} />}
        <h1 className="screen-header-title">{archived ? t('messages.organise.archivedTitle') : t('messages.title')}</h1>
        {!archived && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/messages/new-group')}>
            <Users size={14} aria-hidden="true" /> {t('messages.newGroup')}
          </button>
        )}
      </header>
      <div className="screen-body">
      <ConnectionBanner />
      {/* Days 97-98: the way to the archived chats, when there are some. */}
      {!archived && archivedCount > 0 && (
        <button type="button" className="messages-archived-link" onClick={() => navigate('/messages/archived')}>
          <Archive size={16} aria-hidden="true" />
          <span>{t('messages.organise.archivedLink', { count: archivedCount })}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}

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
          {inboxState === 'empty' && (archived
            ? <p className="messages-empty-state" role="status">{t('messages.organise.noArchived')}</p>
            : <ConversationListEmptyState />)}
          {inboxState === 'list' && (
            <>
              <ConversationList
                conversations={conversations}
                onlineUserIds={onlineUserIds}
                onOpenConversation={openConversation}
                onOptions={setOptionsFor}
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
      <ActionSheet
        open={Boolean(optionsFor)}
        onClose={() => setOptionsFor(null)}
        title={optionsFor?.username}
        items={options}
      />
      </div>
    </div>
  );
}

export default Messages;
