// Day 71: the chat window's pure message helpers (moved out of
// hooks/useConversationMessages.js, which -- with hooks/useMediaMessages.js --
// owns the state they work on).

// B9: keeps every reply's quote in sync when the ORIGINAL is edited or
// deleted (otherwise quotes already on screen would stay stale until a reload).
export function syncQuotes(messages, originalId, patch) {
  return messages.map((m) =>
    m.reply_to && m.reply_to.id === originalId ? { ...m, reply_to: { ...m.reply_to, ...patch } } : m
  );
}

// B9: a reply's quote, built locally for an optimistic message the same way
// the server builds reply_to (see backend messageService.attachReplyPreviews)
// so the bubble looks identical before and after the server confirms it.
export function buildReplyPreview(replyTo) {
  if (!replyTo || replyTo.id == null) return null;
  return {
    id: replyTo.id,
    sender_id: replyTo.sender_id,
    type: replyTo.type || 'text',
    deleted: Boolean(replyTo.deleted_at),
    content: replyTo.deleted_at || !replyTo.content ? null : String(replyTo.content).slice(0, 120)
  };
}

// 'sending'/'failed' are local-only states a server message never carries;
// they always sort as "not yet resolved", so ordering them isn't relevant --
// only sent/delivered/read (the values message_status_update can regress
// from being applied out of order) need a real rank here.
export const STATUS_ORDER = { sent: 0, delivered: 1, read: 2 };

export function makeClientTempId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A message is keyed by its real id once it has one, or by its clientTempId
// while still optimistic (id === null) -- this is what lets mergeMessages
// reconcile "the optimistic row" with "the real row the server sent back" as
// the same slot instead of ending up with both.
export function localKey(message) {
  return message.id != null ? `id:${message.id}` : `tmp:${message.client_temp_id}`;
}

export function sortByCreatedAt(a, b) {
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
