// In-memory sliding-window rate limiter for message sends, scoped per
// (userId, conversationId) pair so a burst in one conversation doesn't
// affect a user's other conversations. A plain Map is enough at this
// scale -- consistent with sockets/presence.js's same reasoning; this
// would need to move to Redis (or similar shared store) the moment the
// backend runs as more than one process/instance, since each process would
// otherwise track its own independent counters.
const WINDOW_MS = 10000;
const MAX_PER_WINDOW = 10;
const CLEANUP_INTERVAL_MS = 60000;

const sendTimestamps = new Map(); // `${userId}:${conversationId}` -> number[]

function isRateLimited(userId, conversationId) {
  const key = `${userId}:${conversationId}`;
  const now = Date.now();
  const recent = (sendTimestamps.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    sendTimestamps.set(key, recent);
    return true;
  }

  recent.push(now);
  sendTimestamps.set(key, recent);
  return false;
}

// Opportunistic sweep so a (userId, conversationId) pair that stops sending
// forever doesn't sit in memory indefinitely. unref() so this interval
// never keeps the process alive on its own.
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of sendTimestamps) {
    if (timestamps.every((t) => now - t >= WINDOW_MS)) {
      sendTimestamps.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupInterval.unref();

module.exports = { isRateLimited };
