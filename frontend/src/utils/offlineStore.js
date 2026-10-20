// Day 72: what the app keeps on this device to work offline -- the newest
// Home posts (and, see the message queue, unsent messages). Per account,
// and wiped by clearLocalSession on logout: a shared phone must not keep
// someone else's feed. localStorage can be full or blocked (private mode);
// then nothing is kept, and the app works as before.
const PREFIX = 'offline:';
const FEED_POSTS = 20;

const feedKey = (userId) => `${PREFIX}feed:${userId}`;

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or not allowed: keep nothing rather than break the page.
  }
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// The first page of Home, as it was just loaded.
export function saveFeed(userId, posts) {
  if (!userId) return;
  write(feedKey(userId), { savedAt: new Date().toISOString(), posts: posts.slice(0, FEED_POSTS) });
}

// { savedAt, posts } or null.
export function readFeed(userId) {
  if (!userId) return null;
  const saved = read(feedKey(userId));
  return saved && Array.isArray(saved.posts) ? saved : null;
}

// Day 72: text messages written offline, waiting to be sent, per account
// and chat: [{ clientTempId, content, replyToMessageId, replyTo, createdAt }].
const outboxKey = (userId, conversationId) => `${PREFIX}outbox:${userId}:${conversationId}`;

export function readOutbox(userId, conversationId) {
  if (!userId || !conversationId) return [];
  const list = read(outboxKey(userId, conversationId));
  return Array.isArray(list) ? list.filter((m) => m && typeof m.clientTempId === 'string' && typeof m.content === 'string') : [];
}

export function saveOutbox(userId, conversationId, list) {
  if (!userId || !conversationId) return;
  if (list.length === 0) {
    try {
      localStorage.removeItem(outboxKey(userId, conversationId));
    } catch {
      // Storage not available: nothing was kept.
    }
    return;
  }
  write(outboxKey(userId, conversationId), list);
}

// Logout: every account's offline copies go.
export function clearOfflineData() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage not available: there is nothing to clear.
  }
}
