// Lightweight in-memory presence tracking -- a plain Map is exactly what
// the task calls for at this scale (no Redis in this stack), but keyed to a
// Set of socket ids per user rather than a single flag/count, since a user
// can have more than one socket connected at once (multiple tabs/devices).
// They're only actually "offline" once every one of those has disconnected.
const socketIdsByUserId = new Map();

// Returns true the first time this user has any connection -- callers use
// that to decide whether to broadcast user_online (not on every extra tab).
function markOnline(userId, socketId) {
  const alreadyOnline = socketIdsByUserId.has(userId);
  if (!alreadyOnline) {
    socketIdsByUserId.set(userId, new Set());
  }
  socketIdsByUserId.get(userId).add(socketId);
  return !alreadyOnline;
}

// Returns true once this was the user's LAST connection -- callers use that
// to decide whether to broadcast user_offline.
function markOffline(userId, socketId) {
  const sockets = socketIdsByUserId.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    socketIdsByUserId.delete(userId);
    return true;
  }
  return false;
}

function isOnline(userId) {
  return socketIdsByUserId.has(userId);
}

module.exports = { markOnline, markOffline, isOnline };
