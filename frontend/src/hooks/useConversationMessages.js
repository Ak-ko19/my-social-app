import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { fetchMessages } from '../services/messageService';

// Owns the message list for a single open conversation: initial load, live
// updates pushed over the shared socket, and -- since this app runs on
// Render's free tier where the backend can spin down and drop the
// connection mid-conversation -- a REST resync of anything sent while
// disconnected, the moment the socket reconnects. Mirrors useComments'
// per-resource, load-then-merge shape and useFeed's stale-response guard.
export function useConversationMessages(conversationId, token) {
  const { socket, connectionState } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const requestIdRef = useRef(0);
  // Tracks whether we've already completed at least one connection, so the
  // resync effect below can tell a genuine reconnect apart from the very
  // first connect (which the initial load effect already covers).
  const hasConnectedOnceRef = useRef(false);

  // Adds/overwrites by id and re-sorts -- the single place both the initial
  // page load and any later merge (live message, reconnect resync) go
  // through, so messages can never end up duplicated or out of order.
  const mergeMessages = useCallback((incoming) => {
    if (!incoming.length) return;
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      incoming.forEach((m) => byId.set(m.id, m));
      return Array.from(byId.values()).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
    });
  }, []);

  const loadMessages = useCallback(() => {
    if (!conversationId || !token) return;
    const requestId = ++requestIdRef.current;

    fetchMessages(conversationId, token)
      .then((data) => {
        if (requestId !== requestIdRef.current) return; // superseded by a newer request
        mergeMessages(data.messages);
        setError(null);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        setError('Failed to load messages');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [conversationId, token, mergeMessages]);

  // Fresh state whenever the open conversation changes.
  useEffect(() => {
    hasConnectedOnceRef.current = false;
    // Deferred by a microtask so this reset runs behind an async boundary
    // instead of synchronously inside the effect's call stack (same
    // reasoning as useFeed's loadMore -- see its comment). loadMessages()
    // below still increments requestIdRef synchronously, so an in-flight
    // fetch from the previous conversationId is invalidated immediately
    // regardless of this deferral.
    Promise.resolve().then(() => {
      setMessages([]);
      setLoading(true);
      setError(null);
    });
    loadMessages();
  }, [loadMessages]);

  // Live messages for this conversation while connected.
  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (message) => {
      if (message.conversation_id !== conversationId) return;
      mergeMessages([message]);
    };
    socket.on('new_message', handleNewMessage);
    return () => socket.off('new_message', handleNewMessage);
  }, [socket, conversationId, mergeMessages]);

  // Reconnect resync: refetch only on a transition INTO 'connected' that
  // follows a connection we'd already established -- not the first one,
  // which the effect above already handles via loadMessages().
  useEffect(() => {
    if (connectionState !== 'connected') return;
    if (hasConnectedOnceRef.current) {
      loadMessages();
    }
    hasConnectedOnceRef.current = true;
  }, [connectionState, loadMessages]);

  return { messages, loading, error, reload: loadMessages };
}
