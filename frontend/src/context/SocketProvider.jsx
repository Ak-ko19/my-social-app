import { useEffect, useState } from 'react';
import SocketContext from './SocketContext';
import { useAuth, forceLogout } from '../hooks/useAuth';
import { API_BASE_URL } from '../api';

// Centralizes the single real-time connection for the whole app (mirrors
// ThemeProvider's placement above <App/> in main.jsx) -- every component
// that needs live messages shares this one socket instead of each opening
// its own. Connects only once a token exists and tears the connection down
// the moment it doesn't (logout, or the api.js 401 interceptor clearing a
// dead token); useAuth() is reactive to those changes without needing a
// page reload, see hooks/useAuth.js.
//
// Day 27: socket.io-client (~20 kB gzipped) is loaded only once someone is
// logged in, so the landing and login pages don't download it.
export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connectionState, setConnectionState] = useState('disconnected');

  useEffect(() => {
    if (!token) {
      // No token -- nothing to connect. The initial state already defaults
      // to (null, 'disconnected'), and if this follows a logout, the
      // previous run's cleanup below already reset both.
      return;
    }

    let torndown = false;
    let nextSocket = null;
    import('socket.io-client').then(({ io }) => {
      if (torndown) return; // logged out (or token changed) while it loaded
      nextSocket = io(API_BASE_URL, {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        // Render's free tier can spin the backend down after inactivity, and a
        // cold start back up takes well more than a few seconds -- a low
        // reconnectionDelayMax would otherwise burn through retries hammering
        // a server that isn't up yet. socket.io backs off exponentially
        // between reconnectionDelay and reconnectionDelayMax on its own.
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000
      });

      nextSocket.on('connect', () => setConnectionState('connected'));
      nextSocket.on('disconnect', () => setConnectionState('disconnected'));
      nextSocket.on('connect_error', (err) => {
        setConnectionState('disconnected');
        // socketAuth.js attaches this specifically for a dead/invalid token --
        // distinct from a network/server-down error, which infinite
        // reconnection (by design) should keep quietly retrying through.
        // Without this check, an expired token would otherwise retry forever,
        // failing the same way every time, with no visible explanation to
        // the user.
        if (err.data?.code === 'AUTH_FAILED') {
          nextSocket.disconnect(); // stop retrying with a token we know is bad
          forceLogout();
        }
      });
      // Fires right as a retry is about to happen, distinct from the harder
      // 'disconnect'/'connect_error' states -- lets a "reconnecting..." UI
      // show specifically while a retry is in flight.
      nextSocket.io.on('reconnect_attempt', () => setConnectionState('connecting'));

      // Set from inside the import's .then, so these "starting to connect"
      // updates run behind an async boundary rather than synchronously in the
      // effect (same reasoning as useFeed's loadMore -- see its comment); the
      // torndown guard above keeps a token change during the load from
      // resurrecting a socket this effect run already tore down.
      setSocket(nextSocket);
      setConnectionState('connecting');
    }).catch(() => { if (!torndown) setConnectionState('disconnected'); }); // chunk failed to load (offline)

    return () => {
      torndown = true;
      if (nextSocket) nextSocket.disconnect();
      setSocket(null);
      setConnectionState('disconnected');
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, connectionState }}>
      {children}
    </SocketContext.Provider>
  );
}
