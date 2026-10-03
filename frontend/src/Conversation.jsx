import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { useConversationMessages } from './hooks/useConversationMessages';
import { usePresenceEvents } from './hooks/usePresenceEvents';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { VoicePlaybackProvider } from './context/VoicePlaybackProvider';
import { fetchConversations, fetchConversationDetails, muteConversation } from './services/messageService';
import { formatRelativeTime } from './utils/formatRelativeTime';
import Avatar from './components/common/Avatar';
import { Bell, BellOff, ChevronLeft, Users } from 'lucide-react';
import { ActionSheet, IconButton } from './components/ui';
import MessageBubble from './components/messages/MessageBubble';
import MessageComposer from './components/messages/MessageComposer';
import MessageThreadSkeleton from './components/messages/MessageThreadSkeleton';
import ConversationListErrorState from './components/messages/ConversationListErrorState';
import ConnectionBanner from './components/messages/ConnectionBanner';
import ReportDialog from './components/feed/ReportDialog';
import './components/messages/Messages.css';
import './components/feed/Feed.css';
import { useTranslation } from 'react-i18next';

const NEAR_BOTTOM_THRESHOLD = 120;
const NEAR_TOP_THRESHOLD = 80;

function Conversation() {
  const { conversationId } = useParams();
  const { token, userId } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const location = useLocation();

  // The inbox passes the conversation row (avatar/username) via navigation
  // state for an instant header -- a direct URL visit/refresh has no state,
  // so fall back to fetching the list once and finding the matching row.
  // Read fresh each render (not just once) so a conversationId change while
  // already mounted (navigating chat-to-chat) picks up the new value too.
  const conversationFromState = location.state?.conversation ?? null;
  const [headerInfo, setHeaderInfo] = useState(conversationFromState);

  const {
    messages,
    loading,
    error,
    loadingOlder,
    hasMoreOlder,
    loadOlder,
    sendMessage,
    retrySend,
    sendVoiceMessage,
    retryVoiceSend,
    deleteMessage,
    editMessage,
    sendImageMessage,
    retryImageSend,
    reload
  } = useConversationMessages(conversationId, token, userId);

  // B9: the message being replied to (null = a normal message), and the id
  // of the message being edited inline (null = none). Callbacks are stable
  // (useCallback) because MessageBubble is memoized.
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const handleReply = useCallback((message) => {
    setEditingId(null);
    setReplyTo(message);
  }, []);
  const handleStartEdit = useCallback((messageId) => {
    setReplyTo(null);
    setEditingId(messageId);
  }, []);
  const handleCancelEdit = useCallback(() => setEditingId(null), []);
  // Day 12: the message being reported (someone else's), or null.
  const [reporting, setReporting] = useState(null);
  const handleReport = useCallback((message) => setReporting(message), []);
  // B10: conversation details (type, group name, members + roles). Fetched
  // for every conversation (cheap); groups use it for the header, sender
  // names and typing names. Refetched when the group changes (group_updated).
  const [details, setDetails] = useState(null);
  // Day 23: mute this chat's notifications (for me).
  const [muteOpen, setMuteOpen] = useState(false);
  const [muteError, setMuteError] = useState('');
  const changeMute = (duration) => {
    setMuteError('');
    muteConversation(conversationId, duration, token)
      .then((state) => setDetails((d) => (d ? { ...d, ...state } : d)))
      .catch((err) => {
        console.error(err);
        setMuteError(t('messages.mute.failed'));
      });
  };
  const muted = Boolean(details?.muted);
  const [detailsError, setDetailsError] = useState('');
  const isGroup = details?.type === 'group';
  const membersById = useMemo(() => new Map((details?.members || []).map((m) => [m.id, m])), [details]);

  const otherUsername = headerInfo?.username;
  const replyAuthorLabel = useCallback(
    (senderId) => {
      if (senderId === userId) return t('messages.you');
      if (isGroup) return membersById.get(senderId)?.username || t('messages.someone');
      return otherUsername || t('messages.them');
    },
    [userId, otherUsername, isGroup, membersById, t]
  );
  const handleSaveEdit = useCallback(
    (messageId, content) => {
      editMessage(messageId, content);
      setEditingId(null);
    },
    [editMessage]
  );
  const { socket } = useSocket();
  const { isOnline } = usePresenceEvents();
  const typingUserIds = useTypingIndicator(conversationId);

  const loadDetails = useCallback(() => {
    if (!token) return;
    fetchConversationDetails(conversationId, token)
      .then((data) => {
        setDetails(data);
        setDetailsError('');
      })
      .catch((err) => {
        // 403 = you were removed from (or left) this group meanwhile -- an
        // expected state, shown as a notice rather than logged as an error.
        if (err.response?.status === 403) {
          setDetailsError(t('messages.noLongerMember'));
          return;
        }
        console.error(err);
      });
  }, [conversationId, token, t]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    if (!socket) return undefined;
    const onGroupUpdated = ({ conversationId: cid }) => {
      if (String(cid) === String(conversationId)) loadDetails();
    };
    socket.on('group_updated', onGroupUpdated);
    return () => socket.off('group_updated', onGroupUpdated);
  }, [socket, conversationId, loadDetails]);

  const containerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const pendingScrollAdjustRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const hasDoneInitialScrollRef = useRef(false);

  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  // Guarded by comparing ids (not just truthiness) so this can't skip
  // fetching while a stale previous conversation's headerInfo is still
  // sitting in state during the render right after conversationId changes.
  useEffect(() => {
    if (headerInfo?.conversation_id === Number(conversationId) || !token) return;
    fetchConversations(token)
      .then((rows) => {
        const match = rows.find((c) => c.conversation_id === Number(conversationId));
        if (match) setHeaderInfo(match);
      })
      .catch((err) => console.error(err));
  }, [headerInfo, token, conversationId]);

  // A conversationId change (navigating from one chat straight to another
  // without unmounting) needs the same "first open" header/scroll/
  // pagination bookkeeping reset a fresh mount would get. Deferred by a
  // microtask so the setHeaderInfo call runs behind an async boundary
  // instead of synchronously inside the effect body (same reasoning as
  // useFeed's loadMore -- see its comment).
  useEffect(() => {
    isNearBottomRef.current = true;
    pendingScrollAdjustRef.current = null;
    prevMessageCountRef.current = 0;
    hasDoneInitialScrollRef.current = false;
    Promise.resolve().then(() => {
      setHeaderInfo(conversationFromState);
    });
  }, [conversationId, conversationFromState]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;

    if (el.scrollTop < NEAR_TOP_THRESHOLD && hasMoreOlder && !loadingOlder) {
      pendingScrollAdjustRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
      loadOlder();
    }
  };

  // Scroll-position bookkeeping runs synchronously after the DOM updates
  // (before paint) so the user never sees an intermediate, wrongly-scrolled
  // frame -- three cases, checked in order:
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // 1. This update was an older-page prepend: keep the content the user
    // was looking at anchored in place instead of preserving the raw
    // scrollTop pixel offset (which would otherwise make the view jump).
    if (pendingScrollAdjustRef.current) {
      const { scrollHeight: prevHeight, scrollTop: prevTop } = pendingScrollAdjustRef.current;
      el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
      pendingScrollAdjustRef.current = null;
      prevMessageCountRef.current = messages.length;
      return;
    }

    // 2. First paint with content -- land at the bottom, same as opening
    // any chat app.
    if (!hasDoneInitialScrollRef.current && messages.length > 0) {
      el.scrollTop = el.scrollHeight;
      hasDoneInitialScrollRef.current = true;
      prevMessageCountRef.current = messages.length;
      return;
    }

    // 3. A message was appended (incoming or our own optimistic send) --
    // only follow it to the bottom if the user was already there, so
    // reading scrollback is never interrupted.
    if (messages.length > prevMessageCountRef.current && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  if (!token) {
    return null;
  }

  const handleSend = (content) => {
    // Sending is always an intent to be at the bottom, even if the user had
    // scrolled up to read history.
    isNearBottomRef.current = true;
    sendMessage(content, replyTo);
    setReplyTo(null);
  };

  const handleSendImage = (file) => {
    isNearBottomRef.current = true;
    sendImageMessage(file, replyTo);
    setReplyTo(null);
  };

  const handleSendVoice = (blob, durationSeconds) => {
    isNearBottomRef.current = true;
    sendVoiceMessage(blob, durationSeconds);
  };

  const handleTyping = () => {
    // Best-effort/non-critical, unlike message sending -- no REST fallback
    // or retry if the socket happens to be down when this fires.
    if (socket?.connected) {
      socket.emit('typing', { conversationId: Number(conversationId) });
    }
  };

  const otherIsOnline = !isGroup && headerInfo ? isOnline(headerInfo.other_user_id, headerInfo.is_online) : false;
  const isOtherTyping = !isGroup && headerInfo ? typingUserIds.has(headerInfo.other_user_id) : false;
  // Groups: name whoever is typing (1: "alice is", 2: "alice and bob are", 3+: "several people are").
  const typingNames = isGroup
    ? [...typingUserIds].filter((id) => id !== userId).map((id) => membersById.get(id)?.username).filter(Boolean)
    : [];
  const groupTypingText =
    typingNames.length === 0 ? null
      : typingNames.length === 1 ? t('messages.typingOne', { name: typingNames[0] })
        : typingNames.length === 2 ? t('messages.typingTwo', { first: typingNames[0], second: typingNames[1] })
          : t('messages.typingMany');

  return (
    <div className="conversation-screen">
      <header className="screen-header conversation-header">
        <IconButton icon={ChevronLeft} aria-label={t('messages.backToMessages')} onClick={() => navigate('/messages')} />
        {isGroup ? (
          // B10: the whole group header opens Group info.
          <button
            type="button"
            className="messages-header-button"
            onClick={() => navigate(`/messages/${conversationId}/info`)}
            aria-label={t('messages.groupInfoLabel', { name: details.name, count: details.members.length })}
          >
            <span className="messages-group-avatar" aria-hidden="true">
              <Users size={20} />
            </span>
            <span className="conversation-header-text">
              <span className="screen-header-title">{details.name}</span>
              <small className="messages-header-status">{t('messages.membersTapInfo', { count: details.members.length })}</small>
            </span>
          </button>
        ) : (
          <>
        {headerInfo && (
          <span className="messages-avatar-wrap">
            <Avatar src={headerInfo.avatar_url} size={40} alt={t('messages.profilePicture', { name: headerInfo.username })} />
            {otherIsOnline && <span className="messages-online-dot" aria-label={t('messages.online')} />}
          </span>
        )}
        <div className="conversation-header-text">
          <h1 className="screen-header-title">{headerInfo ? headerInfo.username : t('messages.conversation')}</h1>
          {headerInfo && (
            <small className="messages-header-status">
              {otherIsOnline
                ? t('messages.activeNow')
                : headerInfo.last_seen
                  ? t('messages.activeAgo', { time: formatRelativeTime(headerInfo.last_seen) })
                  : null}
            </small>
          )}
        </div>
          </>
        )}
        {details && (
          <IconButton
            icon={muted ? BellOff : Bell}
            aria-label={muted ? t('messages.mute.mutedLabel') : t('messages.mute.open')}
            className="conversation-mute-btn"
            onClick={() => setMuteOpen(true)}
          />
        )}
      </header>
      {muteError && <p className="form-error conversation-mute-error" role="alert">{muteError}</p>}
      <ActionSheet
        open={muteOpen}
        onClose={() => setMuteOpen(false)}
        title={muted ? t('messages.mute.mutedTitle') : t('messages.mute.title')}
        items={muted
          ? [{ key: 'unmute', label: t('messages.mute.unmute'), icon: Bell, onSelect: () => changeMute(null) }]
          : [
              { key: '8h', label: t('messages.mute.for8h'), icon: BellOff, onSelect: () => changeMute('8h') },
              { key: '1w', label: t('messages.mute.for1w'), icon: BellOff, onSelect: () => changeMute('1w') },
              { key: 'always', label: t('messages.mute.always'), icon: BellOff, onSelect: () => changeMute('always') }
            ]}
      />

      {detailsError && (
        <p className="form-error conversation-notice" role="alert">
          {detailsError}
        </p>
      )}

      <ConnectionBanner />

      {loading && <MessageThreadSkeleton />}

      {!loading && error && <ConversationListErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <div className="messages-thread" ref={containerRef} onScroll={handleScroll}>
          {loadingOlder && (
            <div className="messages-load-older" role="status" aria-label={t('messages.loadingOlder')}>
              <span className="messages-spinner" />
            </div>
          )}
          {messages.length === 0 && (
            <p className="messages-thread-empty-hint">{t('messages.emptyThread')}</p>
          )}
          {/* Scoped to this one open conversation -- "only one voice message
              plays at a time across the chat window" means this window, not
              the whole app, so the coordinator lives here rather than at the
              app root. */}
          <VoicePlaybackProvider>
            {messages.map((message) => (
              <MessageBubble
                key={message.id ?? message.client_temp_id}
                message={message}
                isOwn={message.sender_id === userId}
                onRetry={retrySend}
                onRetryVoice={retryVoiceSend}
                onRetryImage={retryImageSend}
                onDelete={deleteMessage}
                replyAuthorLabel={replyAuthorLabel}
                senderName={isGroup && message.sender_id !== userId ? membersById.get(message.sender_id)?.username || t('messages.formerMember') : null}
                isEditing={editingId === message.id}
                onReply={handleReply}
                onStartEdit={handleStartEdit}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                onReport={handleReport}
              />
            ))}
          </VoicePlaybackProvider>
        </div>
      )}

      {isOtherTyping && (
        <p className="messages-typing-indicator" role="status">
          {t('messages.typingOne', { name: headerInfo?.username || t('messages.someone') })}
        </p>
      )}
      {groupTypingText && (
        <p className="messages-typing-indicator" role="status">
          {groupTypingText}
        </p>
      )}

      <MessageComposer
        onSend={handleSend}
        onSendVoice={handleSendVoice}
        onSendImage={handleSendImage}
        onTyping={handleTyping}
        replyTo={replyTo}
        replyToLabel={replyTo ? replyAuthorLabel(replyTo.sender_id) : ''}
        onCancelReply={() => setReplyTo(null)}
      />
      {reporting && (
        <ReportDialog
          open
          onClose={() => setReporting(null)}
          targetType="message"
          targetId={reporting.id}
          label={t('report.thisMessage')}
        />
      )}
    </div>
  );
}

export default Conversation;
