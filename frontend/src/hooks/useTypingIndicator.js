import { useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';

const TYPING_TIMEOUT_MS = 3000;

// user_typing is a pure "someone is typing right now" signal -- there's no
// corresponding "stopped typing" event from the server (see
// sockets/index.js's typing handler). This hook owns the "when did I last
// hear from each typer" bookkeeping itself and clears them out on a
// client-side timeout instead, per the messaging feature's design.
export function useTypingIndicator(conversationId) {
  const { socket } = useSocket();
  const [typingUserIds, setTypingUserIds] = useState(() => new Set());
  const timeoutsRef = useRef(new Map()); // userId -> timeoutId

  // Switching conversations invalidates any in-flight typing state.
  useEffect(() => {
    timeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timeoutsRef.current.clear();
    // Deferred by a microtask so this reset runs behind an async boundary
    // instead of synchronously inside the effect body (same reasoning as
    // useFeed's loadMore -- see its comment).
    Promise.resolve().then(() => setTypingUserIds(new Set()));
  }, [conversationId]);

  useEffect(() => {
    if (!socket) return;
    const conversationIdNum = Number(conversationId);

    const handleTyping = ({ conversationId: cid, userId }) => {
      if (cid !== conversationIdNum) return;

      setTypingUserIds((current) => (current.has(userId) ? current : new Set(current).add(userId)));

      const existingTimeout = timeoutsRef.current.get(userId);
      if (existingTimeout) clearTimeout(existingTimeout);
      timeoutsRef.current.set(
        userId,
        setTimeout(() => {
          timeoutsRef.current.delete(userId);
          setTypingUserIds((current) => {
            if (!current.has(userId)) return current;
            const next = new Set(current);
            next.delete(userId);
            return next;
          });
        }, TYPING_TIMEOUT_MS)
      );
    };

    socket.on('user_typing', handleTyping);
    return () => socket.off('user_typing', handleTyping);
  }, [socket, conversationId]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  }, []);

  return typingUserIds;
}
