import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import i18n from '../i18n';
import {
  fetchMessages,
  sendMessageRest,
  markConversationRead,
  deleteMessageRest,
  sendVoiceMessageRest,
  editMessageRest,
  sendImageMessageRest, setMessageReactionRest } from '../services/messageService';

// B9: a reply's quote, built locally for an optimistic message the same way
// the server builds reply_to (see backend messageService.attachReplyPreviews)
// so the bubble looks identical before and after the server confirms it.
// Keeps every reply's quote in sync when the ORIGINAL is edited or deleted
// (otherwise quotes already on screen would stay stale until a reload).
function syncQuotes(messages, originalId, patch) {
  return messages.map((m) =>
    m.reply_to && m.reply_to.id === originalId ? { ...m, reply_to: { ...m.reply_to, ...patch } } : m
  );
}

function buildReplyPreview(replyTo) {
  if (!replyTo || replyTo.id == null) return null;
  return {
    id: replyTo.id,
    sender_id: replyTo.sender_id,
    type: replyTo.type || 'text',
    deleted: Boolean(replyTo.deleted_at),
    content: replyTo.deleted_at || !replyTo.content ? null : String(replyTo.content).slice(0, 120)
  };
}

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
  // messageId -> the pre-delete message, kept only while a socket delete is
  // in flight so handleMessageDeleted/handleErrorEvent (separate effects,
  // async socket events) can confirm or roll back the optimistic delete
  // applied in deleteMessage below.
  const pendingDeletesRef = useRef(new Map());
  // B9: messageId -> the pre-edit message while a socket edit is in flight,
  // so message_error can roll it back (same idea as pendingDeletesRef).
  const pendingEditsRef = useRef(new Map());

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
          setError(i18n.t('errors.loadMessages'));
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
    pendingDeletesRef.current.clear();
    pendingEditsRef.current.clear();
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

  // Live deletes for this conversation -- covers both this client's own
  // delete (room broadcast includes the sender, doubling as its success
  // confirmation) and a delete made from another of this user's connected
  // devices/tabs, or by... well, only the sender can delete, but any other
  // participant's view still needs to update.
  useEffect(() => {
    if (!socket) return;
    const handleMessageDeleted = ({ conversationId: convId, messageId, deletedAt }) => {
      if (convId !== conversationIdNum) return;
      pendingDeletesRef.current.delete(messageId);
      setMessages((current) =>
        syncQuotes(
          current.map((m) =>
            m.id === messageId ? { ...m, deleted_at: deletedAt || new Date().toISOString(), content: null } : m
          ),
          messageId,
          { deleted: true, content: null }
        )
      );
    };
    socket.on('message_deleted', handleMessageDeleted);
    return () => socket.off('message_deleted', handleMessageDeleted);
  }, [socket, conversationIdNum]);

  // B9: live edits (this client's own -- doubling as its confirmation -- or
  // one made from another device/tab).
  useEffect(() => {
    if (!socket) return;
    const handleMessageEdited = ({ conversationId: convId, message }) => {
      if (convId !== conversationIdNum || !message) return;
      pendingEditsRef.current.delete(message.id);
      mergeMessages([message]);
      setMessages((current) => syncQuotes(current, message.id, { content: (message.content || '').slice(0, 120) }));
    };
    socket.on('message_edited', handleMessageEdited);
    return () => socket.off('message_edited', handleMessageEdited);
  }, [socket, conversationIdNum, mergeMessages]);

  // Day 31: live reactions (anyone's, including this client's own from
  // another device). The server sends the message's whole reaction list.
  useEffect(() => {
    if (!socket) return;
    const handleReaction = ({ conversationId: convId, messageId, reactions }) => {
      if (convId !== conversationIdNum) return;
      setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    };
    socket.on('message_reaction', handleReaction);
    return () => socket.off('message_reaction', handleReaction);
  }, [socket, conversationIdNum]);

  // Ack/error for this client's own sends -- see attemptSend below for the
  // other half (arming the timeout these clear).
  useEffect(() => {
    if (!socket) return;
    const handleAck = ({ clientTempId, message }) => {
      clearPendingTimeout(clientTempId);
      mergeMessages([message]);
    };
    const handleErrorEvent = ({ clientTempId, messageId, error: errorMessage }) => {
      if (clientTempId) {
        clearPendingTimeout(clientTempId);
        console.error('send_message failed:', errorMessage);
        setMessages((current) =>
          current.map((m) => (m.client_temp_id === clientTempId && m.id == null ? { ...m, status: 'failed' } : m))
        );
        return;
      }
      if (messageId != null && pendingDeletesRef.current.has(messageId)) {
        const previous = pendingDeletesRef.current.get(messageId);
        pendingDeletesRef.current.delete(messageId);
        console.error('delete_message failed:', errorMessage);
        setMessages((current) => current.map((m) => (m.id === messageId ? previous : m)));
      }
      if (messageId != null && pendingEditsRef.current.has(messageId)) {
        const previous = pendingEditsRef.current.get(messageId);
        pendingEditsRef.current.delete(messageId);
        console.error('edit_message failed:', errorMessage);
        setMessages((current) => current.map((m) => (m.id === messageId ? previous : m)));
        return;
      }
      // Otherwise not one of our sends/deletes/edits (e.g. a mark_read failure) -- ignore.
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
    (clientTempId, content, replyToMessageId = null) => {
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

        socket.emit('send_message', { conversationId, content, clientTempId, replyToMessageId });
        return;
      }

      // Socket isn't connected right now -- REST fallback immediately
      // instead of waiting out a timeout that would only confirm what we
      // already know.
      sendMessageRest(conversationId, content, clientTempId, token, replyToMessageId)
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
    (clientTempId, content, replyTo = null) => ({
      id: null,
      client_temp_id: clientTempId,
      conversation_id: conversationIdNum,
      sender_id: currentUserId,
      content,
      status: 'sending',
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_message_id: replyTo ? replyTo.id : null,
      reply_to: buildReplyPreview(replyTo)
    }),
    [conversationIdNum, currentUserId]
  );

  // replyTo (B9): the message being replied to, or null.
  const sendMessage = useCallback(
    (content, replyTo = null) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const clientTempId = makeClientTempId();
      mergeMessages([buildOptimisticMessage(clientTempId, trimmed, replyTo)]);
      attemptSend(clientTempId, trimmed, replyTo ? replyTo.id : null);
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
  // replyTo: the failed row's reply_to preview (B9) -- a retried reply
  // stays a reply.
  const retrySend = useCallback(
    (clientTempId, content, replyTo = null) => {
      setMessages((current) => current.filter((m) => !(m.client_temp_id === clientTempId && m.id == null)));
      const newClientTempId = makeClientTempId();
      mergeMessages([buildOptimisticMessage(newClientTempId, content, replyTo)]);
      attemptSend(newClientTempId, content, replyTo ? replyTo.id : null);
    },
    [mergeMessages, buildOptimisticMessage, attemptSend]
  );

  // Optimistic-then-reconcile, mirroring attemptSend: applies the "deleted"
  // placeholder locally first, then confirms via whichever transport is
  // live. Socket-connected: the room broadcast (handleMessageDeleted above)
  // or a message_error rollback (handleErrorEvent above) resolves it.
  // Disconnected: falls back to REST immediately, same as attemptSend does
  // for a fresh send while offline.
  const deleteMessage = useCallback(
    (messageId) => {
      let previous = null;
      setMessages((current) =>
        current.map((m) => {
          if (m.id !== messageId || m.deleted_at) return m; // not found, or already deleted -- no-op
          previous = m;
          return { ...m, deleted_at: new Date().toISOString(), content: null };
        })
      );
      if (!previous) return;
      setMessages((current) => syncQuotes(current, messageId, { deleted: true, content: null }));

      if (connectionState === 'connected' && socket) {
        pendingDeletesRef.current.set(messageId, previous);
        socket.emit('delete_message', { conversationId, messageId });
        return;
      }

      deleteMessageRest(conversationId, messageId, token)
        .then((updated) => mergeMessages([updated]))
        .catch((err) => {
          console.error(err);
          setMessages((current) => current.map((m) => (m.id === messageId ? previous : m)));
        });
    },
    [socket, connectionState, conversationId, token, mergeMessages]
  );

  const buildOptimisticVoiceMessage = useCallback(
    (clientTempId, blob, durationSeconds, localUrl) => ({
      id: null,
      client_temp_id: clientTempId,
      conversation_id: conversationIdNum,
      sender_id: currentUserId,
      content: null,
      type: 'voice',
      media_url: localUrl,
      duration_seconds: durationSeconds ?? null,
      status: 'sending',
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      // Client-only bookkeeping -- never present on a real server row, so
      // both fields disappear on their own the moment mergeMessages swaps
      // this optimistic object out for the real one (see attemptVoiceUpload).
      _voiceBlob: blob, // kept so a failed upload can be retried without re-recording
      _uploadProgress: 0 // 0-100; MessageBubble itself decides whether/when to actually show it
    }),
    [conversationIdNum, currentUserId]
  );

  // Voice has no socket send path (an audio Blob isn't something you emit
  // over the socket -- see sendVoiceMessageRest), so this is always REST,
  // unlike attemptSend's socket-first/REST-fallback split for text. Shared
  // by sendVoiceMessage (fresh optimistic row) and retryVoiceSend (an
  // existing 'failed' row going back to 'sending'), same relationship
  // attemptSend has to sendMessage/retrySend.
  //
  // clientTempId now round-trips through the upload (see
  // sendVoiceMessageRest) and comes back on the saved row, so the
  // new_message broadcast this sender's own socket receives (they're in the
  // room too, same as any text send) gets matched and deduplicated by
  // mergeMessages exactly like a text send's ack -- this function doesn't
  // need to race that broadcast itself, it just also calls mergeMessages
  // with the REST response; whichever of the two arrives first evicts the
  // optimistic row, and the other is a harmless idempotent re-merge of the
  // same real row.
  const attemptVoiceUpload = useCallback(
    (clientTempId, blob, durationSeconds, localUrl) => {
      sendVoiceMessageRest(conversationId, blob, clientTempId, token, {
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          setMessages((current) =>
            current.map((m) =>
              m.client_temp_id === clientTempId && m.id == null ? { ...m, _uploadProgress: percent } : m
            )
          );
        }
      })
        .then((savedMessage) => {
          // Real Cloudinary URL is in use now (via mergeMessages below) --
          // the local blob: URL this bubble was playing from is no longer
          // needed.
          URL.revokeObjectURL(localUrl);
          mergeMessages([savedMessage]);
        })
        .catch((err) => {
          console.error(err);
          // Deliberately NOT revoking localUrl here -- blob and URL both
          // stay alive so the failed bubble can still play back what was
          // recorded, and so retryVoiceSend can re-upload the same blob
          // without asking the user to re-record.
          setMessages((current) =>
            current.map((m) =>
              m.client_temp_id === clientTempId && m.id == null ? { ...m, status: 'failed', _uploadProgress: 0 } : m
            )
          );
        });
    },
    [conversationId, token, mergeMessages]
  );

  const sendVoiceMessage = useCallback(
    (blob, durationSeconds) => {
      const clientTempId = makeClientTempId();
      const localUrl = URL.createObjectURL(blob);
      mergeMessages([buildOptimisticVoiceMessage(clientTempId, blob, durationSeconds, localUrl)]);
      attemptVoiceUpload(clientTempId, blob, durationSeconds, localUrl);
    },
    [mergeMessages, buildOptimisticVoiceMessage, attemptVoiceUpload]
  );

  // Mints a NEW clientTempId rather than reusing the failed one, same
  // reasoning as retrySend: a late-arriving response/broadcast for the
  // original attempt must not be able to collide with the retry's own row.
  // Reuses the SAME cached blob (from the failed bubble's _voiceBlob) --
  // the whole point is the user never has to re-record.
  const retryVoiceSend = useCallback(
    (failedClientTempId, blob, durationSeconds) => {
      setMessages((current) => {
        const failed = current.find((m) => m.client_temp_id === failedClientTempId && m.id == null);
        // Revoking here is safe even if this updater runs twice (React
        // StrictMode) -- revoking an already-revoked/unknown URL is a no-op,
        // not an error, unlike the actual upload call below which must only
        // run once.
        if (failed?.media_url) URL.revokeObjectURL(failed.media_url);
        return current.filter((m) => !(m.client_temp_id === failedClientTempId && m.id == null));
      });

      const newClientTempId = makeClientTempId();
      const localUrl = URL.createObjectURL(blob);
      mergeMessages([buildOptimisticVoiceMessage(newClientTempId, blob, durationSeconds, localUrl)]);
      attemptVoiceUpload(newClientTempId, blob, durationSeconds, localUrl);
    },
    [mergeMessages, buildOptimisticVoiceMessage, attemptVoiceUpload]
  );

  // B9 edit: optimistic content + edited_at, confirmed by the room's
  // message_edited broadcast (socket) or the REST response; rolled back on
  // failure. The server enforces own-text-only and the 15-minute window.
  const editMessage = useCallback(
    (messageId, content) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      let previous = null;
      setMessages((current) =>
        current.map((m) => {
          if (m.id !== messageId || m.deleted_at) return m;
          previous = m;
          return { ...m, content: trimmed, edited_at: new Date().toISOString() };
        })
      );
      if (!previous) return;
      setMessages((current) => syncQuotes(current, messageId, { content: trimmed.slice(0, 120) }));

      if (connectionState === 'connected' && socket) {
        pendingEditsRef.current.set(messageId, previous);
        socket.emit('edit_message', { conversationId, messageId, content: trimmed });
        return;
      }
      editMessageRest(conversationId, messageId, trimmed, token)
        .then((updated) => {
          // Same as message_edited: the server's text (Day 43: Zawgyi ->
          // Unicode) for the bubble and the quotes of it.
          mergeMessages([updated]);
          setMessages((current) => syncQuotes(current, messageId, { content: (updated.content || '').slice(0, 120) }));
        })
        .catch((err) => {
          console.error(err);
          setMessages((current) => current.map((m) => (m.id === messageId ? previous : m)));
        });
    },
    [socket, connectionState, conversationId, token, mergeMessages]
  );

  // Day 31: react (reaction = key) or remove your reaction (null).
  // Optimistic; the REST answer (and the room's message_reaction event)
  // carries the authoritative list; rolled back on failure.
  const reactToMessage = useCallback(
    (messageId, reaction) => {
      let previous = null;
      setMessages((current) =>
        current.map((m) => {
          if (m.id !== messageId || m.deleted_at) return m;
          previous = m.reactions || [];
          const others = previous.filter((x) => x.user_id !== currentUserId);
          return { ...m, reactions: reaction ? [...others, { user_id: currentUserId, reaction }] : others };
        })
      );
      setMessageReactionRest(conversationId, messageId, reaction, token)
        .then(({ reactions }) => setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, reactions } : m))))
        .catch((err) => {
          console.error(err);
          if (previous) setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, reactions: previous } : m)));
        });
    },
    [conversationId, currentUserId, token]
  );

  // B9 image send -- REST only (a file isn't a socket payload), optimistic
  // bubble from a local blob URL, same shape as voice sends.
  const attemptImageUpload = useCallback(
    (clientTempId, file, localUrl, replyTo) => {
      sendImageMessageRest(conversationId, file, clientTempId, token, {
        replyToMessageId: replyTo ? replyTo.id : null,
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          setMessages((current) =>
            current.map((m) => (m.client_temp_id === clientTempId && m.id == null ? { ...m, _uploadProgress: percent } : m))
          );
        }
      })
        .then((saved) => {
          URL.revokeObjectURL(localUrl);
          mergeMessages([saved]);
        })
        .catch((err) => {
          console.error(err);
          setMessages((current) =>
            current.map((m) => (m.client_temp_id === clientTempId && m.id == null ? { ...m, status: 'failed', _uploadProgress: 0 } : m))
          );
        });
    },
    [conversationId, token, mergeMessages]
  );

  const buildOptimisticImage = useCallback(
    (clientTempId, file, localUrl, replyTo) => ({
      id: null,
      client_temp_id: clientTempId,
      conversation_id: conversationIdNum,
      sender_id: currentUserId,
      content: null,
      type: 'image',
      media_url: localUrl,
      status: 'sending',
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_message_id: replyTo ? replyTo.id : null,
      reply_to: buildReplyPreview(replyTo),
      _imageFile: file, // kept so a failed upload can be retried
      _uploadProgress: 0
    }),
    [conversationIdNum, currentUserId]
  );

  const sendImageMessage = useCallback(
    (file, replyTo = null) => {
      if (!file) return;
      const clientTempId = makeClientTempId();
      const localUrl = URL.createObjectURL(file);
      mergeMessages([buildOptimisticImage(clientTempId, file, localUrl, replyTo)]);
      attemptImageUpload(clientTempId, file, localUrl, replyTo);
    },
    [mergeMessages, buildOptimisticImage, attemptImageUpload]
  );

  const retryImageSend = useCallback(
    (failedClientTempId, file, replyTo = null) => {
      setMessages((current) => {
        const failed = current.find((m) => m.client_temp_id === failedClientTempId && m.id == null);
        if (failed?.media_url) URL.revokeObjectURL(failed.media_url);
        return current.filter((m) => !(m.client_temp_id === failedClientTempId && m.id == null));
      });
      sendImageMessage(file, replyTo);
    },
    [sendImageMessage]
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
    sendVoiceMessage,
    retryVoiceSend,
    deleteMessage,
    editMessage,
    reactToMessage,
    sendImageMessage,
    retryImageSend,
    reload: () => loadMessages({ markRead: false })
  };
}
