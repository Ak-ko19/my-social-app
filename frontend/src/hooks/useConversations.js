import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { fetchConversations } from '../services/messageService';

// Owns the inbox's conversation list: initial load, plus live in-place
// updates from the shared socket so a new message doesn't require
// re-fetching the whole list. Mirrors useFeed's load/reload/stale-response
// guard shape.
export function useConversations(token, currentUserId) {
  const { socket, connectionState } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const requestIdRef = useRef(0);
  const hasConnectedOnceRef = useRef(false);

  const load = useCallback(() => {
    if (!token) return;
    const requestId = ++requestIdRef.current;

    fetchConversations(token)
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        setConversations(data);
        setError(null);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        setError('Failed to load conversations');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Reconnect resync, same as useConversationMessages: any new_message/
  // message_deleted events emitted while the socket was down are lost for
  // good, so refetch the list on every transition back INTO 'connected'
  // after the first one (the initial load above already covers that).
  useEffect(() => {
    if (connectionState !== 'connected') return;
    if (hasConnectedOnceRef.current) load();
    hasConnectedOnceRef.current = true;
  }, [connectionState, load]);

  // Live updates: a new_message for a conversation already in the list
  // updates its preview/unread count in place and moves it to the top,
  // instead of re-fetching on every message.
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      setConversations((current) => {
        const index = current.findIndex((c) => c.conversation_id === message.conversation_id);
        if (index === -1) {
          // A conversation we don't know about yet (e.g. just created from
          // the other side) -- refetch in the background rather than
          // fabricating a row without the other participant's name/avatar.
          load();
          return current;
        }

        const existing = current[index];
        const isFromOther = message.sender_id !== currentUserId;
        const updated = {
          ...existing,
          last_message: message.content,
          last_message_id: message.id,
          last_message_at: message.created_at,
          unread_count: isFromOther ? existing.unread_count + 1 : existing.unread_count
        };

        const next = current.slice();
        next.splice(index, 1);
        next.unshift(updated);
        return next;
      });
    };

    socket.on('new_message', handleNewMessage);
    return () => socket.off('new_message', handleNewMessage);
  }, [socket, currentUserId, load]);

  // A delete only changes the row's preview text when it deleted the
  // CURRENT last message -- matched by id, since last_message_id is only
  // ever set to the newest message's id (either from initial load or
  // handleNewMessage above). An older message being deleted doesn't affect
  // what's shown here at all.
  useEffect(() => {
    if (!socket) return;

    const handleMessageDeleted = ({ conversationId, messageId }) => {
      setConversations((current) =>
        current.map((c) =>
          c.conversation_id === conversationId && c.last_message_id === messageId
            ? { ...c, last_message: 'This message was deleted' }
            : c
        )
      );
    };

    socket.on('message_deleted', handleMessageDeleted);
    return () => socket.off('message_deleted', handleMessageDeleted);
  }, [socket]);

  return { conversations, loading, error, reload: load };
}
