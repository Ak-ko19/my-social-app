import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { fetchConversations, pinConversation, archiveConversation } from '../services/messageService';
import { serverErrorText } from '../utils/serverError';
import i18n from '../i18n';

// Owns the inbox's conversation list: initial load, plus live in-place
// updates from the shared socket so a new message doesn't require
// re-fetching the whole list. Mirrors useFeed's load/reload/stale-response
// guard shape.
// Inbox preview line for a message -- mirrors the backend getConversations
// CASE (voice/image have no text of their own, only an optional caption).
export function messagePreviewText(message) {
  if (message.deleted_at) return 'This message was deleted';
  if (message.type === 'voice') return 'Voice message';
  if (message.type === 'image') return message.content ? 'Photo: ' + message.content : 'Photo';
  return message.content;
}

// Days 97-98: { archived: true } lists the archived chats instead; the
// inbox also learns archivedCount, and both can pin and archive.
export function useConversations(token, currentUserId, { archived = false } = {}) {
  const { socket, connectionState } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Day 70: chats come a page at a time; nextCursor is null at the end.
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  // A pin or archive the server refused (e.g. a fourth pin).
  const [actionError, setActionError] = useState('');

  const requestIdRef = useRef(0);
  const hasConnectedOnceRef = useRef(false);

  const load = useCallback(() => {
    if (!token) return;
    const requestId = ++requestIdRef.current;

    fetchConversations(token, { archived })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        setConversations(data.conversations);
        setNextCursor(data.nextCursor);
        setArchivedCount(data.archivedCount ?? 0);
        setError(null);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        setError(i18n.t('errors.loadConversations'));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [token, archived]);

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
        // Days 97-98: a new message takes an archived chat back to the inbox
        // (unless it's muted) -- so it leaves this list.
        if (archived && !existing.muted) {
          load();
          return current;
        }
        const isFromOther = message.sender_id !== currentUserId;
        const updated = {
          ...existing,
          last_message: messagePreviewText(message),
          last_message_id: message.id,
          last_message_at: message.created_at,
          unread_count: isFromOther ? existing.unread_count + 1 : existing.unread_count
        };

        const next = current.slice();
        next.splice(index, 1);
        // After the pinned chats (they stay on top).
        const at = updated.pinned ? 0 : next.findIndex((c) => !c.pinned);
        next.splice(at === -1 ? next.length : at, 0, updated);
        return next;
      });
    };

    socket.on('new_message', handleNewMessage);
    return () => socket.off('new_message', handleNewMessage);
  }, [socket, currentUserId, load, archived]);

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

  // The next page, after the chats on screen (a chat that moved up since is
  // not listed twice). A reload starts over from the first page.
  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    fetchConversations(token, { cursor: nextCursor, archived })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        setConversations((current) => {
          const have = new Set(current.map((c) => c.conversation_id));
          return [...current, ...data.conversations.filter((c) => !have.has(c.conversation_id))];
        });
        setNextCursor(data.nextCursor);
      })
      .catch((err) => {
        console.error(err);
        setError(i18n.t('errors.loadConversations'));
      })
      .finally(() => setLoadingMore(false));
  }, [token, nextCursor, loadingMore, archived]);

  // Days 97-98: pin or archive, then the list again from the server (pinned
  // order and paging are its to decide). An archived chat leaves this list
  // at once.
  const organise = useCallback((conversation, change) => {
    setActionError('');
    const id = conversation.conversation_id;
    if (change.archived !== undefined && change.archived !== archived) {
      setConversations((current) => current.filter((c) => c.conversation_id !== id));
    }
    const request = change.pinned !== undefined
      ? pinConversation(id, change.pinned, token)
      : archiveConversation(id, change.archived, token);
    return request
      .catch((err) => {
        console.error(err);
        setActionError(serverErrorText(err, change.pinned !== undefined ? 'messages.organise.pinFailed' : 'messages.organise.archiveFailed'));
      })
      .finally(load);
  }, [token, archived, load]);

  return { conversations, loading, error, reload: load, nextCursor, loadMore, loadingMore, archivedCount, organise, actionError };
}
