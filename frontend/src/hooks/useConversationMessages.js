import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { fetchMessages, sendMessageRest, markConversationRead } from '../services/messageService';

const SEND_TIMEOUT_MS = 5000;
// 'sending'/'failed' are local-only states a server message never carries;
// they always sort as "not yet resolved", so ordering them isn't relevant --
// only sent/delivered/read (the values message_status_update can regress
// from being applied out of order) need a real rank here.
const STATUS_ORDER = { sent: 0, delivered: 1, read: 2 };

function makeClientTempId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A message is keyed by its real id once it has one, or by its clientTempId
// while still optimistic (id === null) -- this is what lets mergeMessages
// below reconcile "the optimistic row" with "the real row the server sent
// back" as the same slot instead of ending up with both.
function localKey(message) {
  return message.id != null ? `id:${message.id}` : `tmp:${message.client_temp_id}`;
}

function sortByCreatedAt(a, b) {
  const diff = new Date(a.created_at) - new Date(b.created_at);
  if (diff !== 0) return diff;
  // Stable tiebreak for same-millisecond timestamps: a still-optimistic
  // message (no id yet) is always the newest thing at the moment it's
  // created, so it sorts after any real, already-persisted message. Two
  // optimistic messages can't be ordered against each other this way (no id
  // yet for either) -- returning 0 there specifically avoids an
  // inconsistent comparator (Array.prototype.sort is undefined behavior if
  // comparing (a, b) and (b, a) can't both agree).
  if (a.id == null && b.id == null) return 0;
  if (a.id == null) return 1;
  if (b.id == null) return -1;
  return a.id - b.id;
}

// Owns everything the chat window needs for one open conversation: initial
// load + mark-as-read, reverse-cursor pagination for older history,
// optimistic send (socket-first with a 5s ack timeout, REST fallback when
// disconnected, retry), live message/status updates, and reconnect resync.
// Mirrors useComments' optimistic-then-reconcile shape and useFeed's
// stale-response guard, extended for a live transport instead of a purely
// request/response one.
export function useConversationMessages(conversationId, token, currentUserId) {
  // useParams() (the caller's source for conversationId) always yields a
  // string, but every server-provided conversation_id/conversationId field
  // (message.conversation_id, message_status_update's conversationId, ...)
  // is a number -- comparing the raw string against those with === would
  // silently never match. Everything below compares against this instead.
  const conversationIdNum = Number(conversationId);
  const { socket, connectionState } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const requestIdRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const hasConnectedOnceRef = useRef(false);
  const pendingTimeoutsRef = useRef(new Map()); // clientTempId -> timeoutId

  const mergeMessages = useCallback((incoming) => {
    if (!incoming.length) return;
    setMessages((current) => {
      const byKey = new Map(current.map((m) => [localKey(m), m]));
      incoming.forEach((incomingMessage) => {
        if (incomingMessage.client_temp_id) {
          const tmpKey = `tmp:${incomingMessage.client_temp_id}`;
          const pending = byKey.get(tmpKey);
          // Only reconcile with OUR OWN still-pending optimistic entry --
          // clientTempId is attacker/bug-reachable input from whoever sent
          // incomingMessage, so if it happens to collide with a different
          // sender's in-flight clientTempId, that unrelated message must
          // never evict this client's own pending "sending..." bubble.
          if (pending && pending.sender_id === incomingMessage.sender_id) {
            byKey.delete(tmpKey);
          }
        }
        byKey.set(localKey(incomingMessage), incomingMessage);
      });
      return Array.from(byKey.values()).sort(sortByCreatedAt);
    });
  }, []);

  const clearPendingTimeout = useCallback((clientTempId) => {
    const timeoutId = pendingTimeoutsRef.current.get(clientTempId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingTimeoutsRef.current.delete(clientTempId);
    }
  }, []);

  const loadMessages = useCallback(
    ({ markRead = false } = {}) => {
      if (!conversationId || !token) return;
      const requestId = ++requestIdRef.current;

      fetchMessages(conversationId, token)
        .then((data) => {
          if (requestId !== requestIdRef.current) return; // superseded by a newer request
          mergeMessages(data.messages);
          setNextCursor(data.nextCursor);
          setError(null);
          // Fire-and-forget: this is a "mark as read" side effect, not
          // something the message list's own loading state should wait on.
          if (markRead) {
            markConversationRead(conversationId, token).catch((err) => console.error(err));
          }
        })
        .catch((err) => {
          if (requestId !== requestIdRef.current) return;
          console.error(err);
          setError('Failed to load messages');
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    },
    [conversationId, token, mergeMessages]
  );

  const loadOlder = useCallback(() => {
    if (!conversationId || !token || !nextCursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const requestId = ++requestIdRef.current;

    fetchMessages(conversationId, token, { cursor: nextCursor })
      .then((data) => {
        if (requestId !== requestIdRef.current) return; // conversation changed mid-flight
        mergeMessages(data.messages);
        setNextCursor(data.nextCursor);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      });
  }, [conversationId, token, nextCursor, mergeMessages]);

  // Fresh state whenever the open conversation changes.
  useEffect(() => {
    hasConnectedOnceRef.current = false;
    loadingOlderRef.current = false;
    pendingTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    pendingTimeoutsRef.current.clear();
    // Deferred by a microtask so this reset runs behind an async boundary
    // instead of synchronously inside the effect's call stack (same
    // reasoning as useFeed's loadMore -- see its comment). loadMessages()
    // below still increments requestIdRef synchronously, so any in-flight
    // fetch from the previous conversationId is invalidated immediately.
    Promise.resolve().then(() => {
      setMessages([]);
      setLoading(true);
      setError(null);
      setNextCursor(null);
    });
    loadMessages({ markRead: true });
  }, [loadMessages]);

  // Live messages for this conversation while connected.
  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (message) => {
      if (message.conversation_id !== conversationIdNum) return;
      mergeMessages([message]);
    };
    socket.on('new_message', handleNewMessage);
    return () => socket.off('new_message', handleNewMessage);
  }, [socket, conversationIdNum, mergeMessages]);

  // Ack/error for this client's own sends -- see attemptSend below for the
  // other half (arming the timeout these clear).
  useEffect(() => {
    if (!socket) return;
    const handleAck = ({ clientTempId, message }) => {
      clearPendingTimeout(clientTempId);
      mergeMessages([message]);
    };
    const handleErrorEvent = ({ clientTempId, error: errorMessage }) => {
      if (!clientTempId) return; // not one of our sends (e.g. a mark_read failure)
      clearPendingTimeout(clientTempId);
      console.error('send_message failed:', errorMessage);
      setMessages((current) =>
        current.map((m) => (m.client_temp_id === clientTempId && m.id == null ? { ...m, status: 'failed' } : m))
      );
    };
    socket.on('message_ack', handleAck);
    socket.on('message_error', handleErrorEvent);
    return () => {
      socket.off('message_ack', handleAck);
      socket.off('message_error', handleErrorEvent);
    };
  }, [socket, mergeMessages, clearPendingTimeout]);

  // Delivered/read updates for this client's own sent messages.
  useEffect(() => {
    if (!socket) return;
    const handleStatusUpdate = (payload) => {
      if (payload.conversationId !== conversationIdNum) return;
      const idSet = new Set(payload.messageIds);
      setMessages((current) =>
        current.map((m) => {
          if (!idSet.has(m.id)) return m;
          // Never regress an already-'read' message back to 'delivered' if
          // events happen to arrive out of order.
          if (STATUS_ORDER[payload.status] < STATUS_ORDER[m.status]) return m;
          return { ...m, status: payload.status };
        })
      );
    };
    socket.on('message_status_update', handleStatusUpdate);
    return () => socket.off('message_status_update', handleStatusUpdate);
  }, [socket, conversationIdNum]);

  // Reconnect resync: refetch only on a transition INTO 'connected' that
  // follows a connection already established -- not the first one, which
  // the effect above already handles via loadMessages().
  useEffect(() => {
    if (connectionState !== 'connected') return;
    if (hasConnectedOnceRef.current) {
      loadMessages({ markRead: false });
    }
    hasConnectedOnceRef.current = true;
  }, [connectionState, loadMessages]);

  // Belt-and-suspenders cleanup on unmount (the conversationId-change effect
  // above already clears these when switching conversations).
  useEffect(() => {
    const timeouts = pendingTimeoutsRef.current;
    return () => timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  }, []);

  // Shared by sendMessage (fresh optimistic row) and retrySend (an existing
  // 'failed' row going back to 'sending') -- decides socket vs. REST fresh
  // each time it's called, so a retry after reconnecting correctly uses the
  // socket even if the original attempt had to fall back to REST.
  const attemptSend = useCallback(
    (clientTempId, content) => {
      setMessages((current) =>
        current.map((m) => (m.client_temp_id === clientTempId && m.id == null ? { ...m, status: 'sending' } : m))
      );

      if (connectionState === 'connected' && socket) {
        const timeoutId = setTimeout(() => {
          pendingTimeoutsRef.current.delete(clientTempId);
          setMessages((current) =>
            current.map((m) =>
              m.client_temp_id === clientTempId && m.id == null && m.status === 'sending'
                ? { ...m, status: 'failed' }
                : m
            )
          );
        }, SEND_TIMEOUT_MS);
        pendingTimeoutsRef.current.set(clientTempId, timeoutId);

        socket.emit('send_message', { conversationId, content, clientTempId });
        return;
      }

      // Socket isn't connected right now -- REST fallback immediately
      // instead of waiting out a timeout that would only confirm what we
      // already know.
      sendMessageRest(conversationId, content, clientTempId, token)
        .then((savedMessage) => mergeMessages([savedMessage]))
        .catch((err) => {
          console.error(err);
          setMessages((current) =>
            current.map((m) => (m.client_temp_id === clientTempId && m.id == null ? { ...m, status: 'failed' } : m))
          );
        });
    },
    [socket, connectionState, conversationId, token, mergeMessages]
  );

  const buildOptimisticMessage = useCallback(
    (clientTempId, content) => ({
      id: null,
      client_temp_id: clientTempId,
      conversation_id: conversationIdNum,
      sender_id: currentUserId,
      content,
      status: 'sending',
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null
    }),
    [conversationIdNum, currentUserId]
  );

  const sendMessage = useCallback(
    (content) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const clientTempId = makeClientTempId();
      mergeMessages([buildOptimisticMessage(clientTempId, trimmed)]);
      attemptSend(clientTempId, trimmed);
    },
    [mergeMessages, buildOptimisticMessage, attemptSend]
  );

  // Mints a NEW clientTempId rather than reusing the failed one. Given how
  // long a Render free-tier reconnect can take, "no ack within 5s" doesn't
  // necessarily mean the original send failed server-side -- its ack could
  // just be running late. If the user retries and THEN that stale ack
  // arrives, reusing the same clientTempId would let it collide with the
  // retry's own (different) row. A fresh id keeps the two attempts from
  // corrupting each other's local state; it doesn't achieve exactly-once
  // delivery (a genuinely-late success plus a retry can still both persist
  // as two real messages server-side), which would need backend-side
  // idempotency to fully close.
  const retrySend = useCallback(
    (clientTempId, content) => {
      setMessages((current) => current.filter((m) => !(m.client_temp_id === clientTempId && m.id == null)));
      const newClientTempId = makeClientTempId();
      mergeMessages([buildOptimisticMessage(newClientTempId, content)]);
      attemptSend(newClientTempId, content);
    },
    [mergeMessages, buildOptimisticMessage, attemptSend]
  );

  return {
    messages,
    loading,
    error,
    loadingOlder,
    hasMoreOlder: nextCursor !== null,
    loadOlder,
    sendMessage,
    retrySend,
    reload: () => loadMessages({ markRead: false })
  };
}
