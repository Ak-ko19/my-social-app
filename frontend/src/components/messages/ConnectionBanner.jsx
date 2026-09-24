import { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';

// Only shown once the socket has been down for a moment -- the normal
// initial connect (and a quick blip) resolves well within this, so the
// banner never flashes on every page load.
const SHOW_AFTER_MS = 2000;

// Tells the user their live connection dropped instead of chat silently
// going stale. Sending still works while this is up (useConversationMessages
// falls back to REST), and both the inbox and the open thread refetch on
// reconnect, so this is purely informational.
function ConnectionBanner() {
  const { connectionState } = useSocket();
  const [visible, setVisible] = useState(false);
  const isDown = connectionState !== 'connected';

  useEffect(() => {
    if (!isDown) {
      // Deferred by a microtask so this state update runs behind an async
      // boundary instead of synchronously inside the effect (same reasoning
      // as useFeed's loadMore).
      Promise.resolve().then(() => setVisible(false));
      return;
    }
    const timeoutId = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timeoutId);
  }, [isDown]);

  if (!visible) return null;

  return (
    <div className="messages-connection-banner" role="status">
      {connectionState === 'connecting' ? 'Reconnecting…' : 'Connection lost. Trying to reconnect…'}
    </div>
  );
}

export default ConnectionBanner;
