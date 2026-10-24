import { useContext, useEffect, useRef } from 'react';
import SocketContext from '../context/SocketContext';

// Day 81: run `handler(payload)` whenever the server sends `event` on this
// user's socket. Works outside a SocketProvider too (tests, logged-out
// screens): then it simply never fires. The latest handler is always the
// one called, without re-subscribing on every render.
export function useSocketEvent(event, handler) {
  const socket = useContext(SocketContext)?.socket;
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!socket) return undefined;
    const listener = (payload) => latest.current(payload);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
}
