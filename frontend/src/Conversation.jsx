import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { useConversationMessages } from './hooks/useConversationMessages';
import { usePresenceEvents } from './hooks/usePresenceEvents';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { fetchConversations } from './services/messageService';
import { formatRelativeTime } from './utils/formatRelativeTime';
import Avatar from './components/common/Avatar';
import MessageBubble from './components/messages/MessageBubble';
import MessageComposer from './components/messages/MessageComposer';
import MessageThreadSkeleton from './components/messages/MessageThreadSkeleton';
import ConversationListErrorState from './components/messages/ConversationListErrorState';
import './components/messages/Messages.css';
import './components/feed/Feed.css';

const NEAR_BOTTOM_THRESHOLD = 120;
const NEAR_TOP_THRESHOLD = 80;

function Conversation() {
  const { conversationId } = useParams();
  const { token, userId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // The inbox passes the conversation row (avatar/username) via navigation
  // state for an instant header -- a direct URL visit/refresh has no state,
  // so fall back to fetching the list once and finding the matching row.
  // Read fresh each render (not just once) so a conversationId change while
  // already mounted (navigating chat-to-chat) picks up the new value too.
  const conversationFromState = location.state?.conversation ?? null;
  const [headerInfo, setHeaderInfo] = useState(conversationFromState);

  const { messages, loading, error, loadingOlder, hasMoreOlder, loadOlder, sendMessage, retrySend, reload } =
    useConversationMessages(conversationId, token, userId);
  const { socket } = useSocket();
  const { isOnline } = usePresenceEvents();
  const typingUserIds = useTypingIndicator(conversationId);

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
    sendMessage(content);
  };

  const handleTyping = () => {
    // Best-effort/non-critical, unlike message sending -- no REST fallback
    // or retry if the socket happens to be down when this fires.
    if (socket?.connected) {
      socket.emit('typing', { conversationId: Number(conversationId) });
    }
  };

  const otherIsOnline = headerInfo ? isOnline(headerInfo.other_user_id, headerInfo.is_online) : false;
  const isOtherTyping = headerInfo ? typingUserIds.has(headerInfo.other_user_id) : false;

  return (
    <div style={{ padding: '20px' }}>
      <p><a href="/messages">Back to Messages</a></p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        {headerInfo && (
          <span className="messages-avatar-wrap">
            <Avatar src={headerInfo.avatar_url} size={40} alt={`${headerInfo.username}'s profile picture`} />
            {otherIsOnline && <span className="messages-online-dot" aria-label="Online" />}
          </span>
        )}
        <div>
          <h2 style={{ margin: 0 }}>{headerInfo ? headerInfo.username : 'Conversation'}</h2>
          {headerInfo && (
            <small className="messages-header-status">
              {otherIsOnline
                ? 'Active now'
                : headerInfo.last_seen
                  ? `Active ${formatRelativeTime(headerInfo.last_seen)} ago`
                  : null}
            </small>
          )}
        </div>
      </div>

      {loading && <MessageThreadSkeleton />}

      {!loading && error && <ConversationListErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <div className="messages-thread" ref={containerRef} onScroll={handleScroll}>
          {loadingOlder && (
            <div className="messages-load-older" role="status" aria-label="Loading older messages">
              <span className="messages-spinner" />
            </div>
          )}
          {messages.length === 0 && (
            <p className="messages-thread-empty-hint">No messages yet. Say hello!</p>
          )}
          {messages.map((message) => (
            <MessageBubble
              key={message.id ?? message.client_temp_id}
              message={message}
              isOwn={message.sender_id === userId}
              onRetry={retrySend}
            />
          ))}
        </div>
      )}

      {isOtherTyping && (
        <p className="messages-typing-indicator" role="status">
          {headerInfo?.username || 'Someone'} is typing…
        </p>
      )}

      <MessageComposer onSend={handleSend} onTyping={handleTyping} />
    </div>
  );
}

export default Conversation;
