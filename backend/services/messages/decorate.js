// Day 116: the read side -- what is added to message rows before they reach
// a client (the quoted message, the story a reply answers, reactions) and
// what is taken out of an unsent one. One query per page for each, never
// one per message. Split out of messageService.js.
const db = require('../../db');

const REPLY_PREVIEW_LENGTH = 120;

// Adds reply_to: { id, sender_id, type, content, deleted } to every row
// that replies to something -- one query for the whole page, not one per
// message. A deleted original shows as deleted (no content), same scrub
// rule as the thread itself. Day 100: and the story a story reply answers
// (attachStories) -- every path that shapes messages goes through here.
async function attachReplyPreviews(conversationId, rows) {
  return attachStories(await attachQuotes(conversationId, rows));
}

async function attachQuotes(conversationId, rows) {
  const ids = [...new Set(rows.map((r) => r.reply_to_message_id).filter(Boolean))];
  if (ids.length === 0) return rows.map((r) => ({ ...r, reply_to: null }));
  const result = await db.query(
    'SELECT id, sender_id, type, content, deleted_at FROM messages WHERE id = ANY($1::int[]) AND conversation_id = $2',
    [ids, conversationId]
  );
  const byId = new Map(result.rows.map((m) => [m.id, m]));
  return rows.map((r) => {
    const original = r.reply_to_message_id ? byId.get(r.reply_to_message_id) : null;
    if (!original) return { ...r, reply_to: null };
    const deleted = Boolean(original.deleted_at);
    return {
      ...r,
      reply_to: {
        id: original.id,
        sender_id: original.sender_id,
        type: original.type,
        deleted,
        content: deleted || !original.content ? null : original.content.slice(0, REPLY_PREVIEW_LENGTH)
      }
    };
  });
}

// Day 100: story: { id, media_url } on a story reply while that story is
// still showing, else null (the bubble says "Story unavailable", as
// Instagram). Both people in the chat get the same shape (new_message goes
// to the room), so a block either way between the author and the sender
// hides it -- like the story itself.
async function attachStories(rows) {
  const ids = [...new Set(rows.map((r) => r.story_id).filter(Boolean))];
  if (ids.length === 0) return rows.map((r) => ({ ...r, story: null }));
  const result = await db.query(
    `SELECT s.id, s.media_url, s.user_id FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.id = ANY($1::int[]) AND s.expires_at > now() AND NOT u.is_deactivated`,
    [ids]
  );
  const byId = new Map(result.rows.map((s) => [s.id, s]));
  // Blocks among the authors and senders, in one query for the page.
  const people = [...new Set(rows.map((r) => r.sender_id).concat(result.rows.map((s) => s.user_id)))];
  const blocks = await db.query('SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ANY($1::int[]) AND blocked_id = ANY($1::int[])', [people]);
  const blockedPair = new Set(blocks.rows.flatMap((b) => [`${b.blocker_id}:${b.blocked_id}`, `${b.blocked_id}:${b.blocker_id}`]));
  return rows.map((r) => {
    const s = byId.get(r.story_id);
    const shown = s && !r.deleted_at && !blockedPair.has(`${s.user_id}:${r.sender_id}`);
    return { ...r, story: shown ? { id: s.id, media_url: s.media_url } : null };
  });
}

// Soft-deleted messages (deleted_at set) keep their row -- other fields
// (id, sender_id, created_at, status) still matter for rendering a
// "message deleted" placeholder in the right place in the thread -- but
// their content must never reach a client over the wire.
//
// B9 audit fix: media is scrubbed too. Before this, a deleted VOICE
// message still sent its media_url (and duration) to both participants, so
// it stayed playable; the same would apply to image messages.
function scrubDeletedContent(message) {
  if (!message.deleted_at) return message;
  return { ...message, content: null, media_url: null, duration_seconds: null, reactions: [] };
}

// Day 31: reactions on these messages, as reactions: [{ user_id, reaction }]
// (oldest first) on each row -- one query for the whole page.
async function attachReactions(rows) {
  const ids = rows.map((r) => r.id).filter((id) => id != null);
  if (ids.length === 0) return rows.map((r) => ({ ...r, reactions: [] }));
  const result = await db.query(
    'SELECT message_id, user_id, reaction FROM message_reactions WHERE message_id = ANY($1::int[]) ORDER BY created_at, user_id',
    [ids]
  );
  const byMessage = new Map();
  for (const row of result.rows) {
    if (!byMessage.has(row.message_id)) byMessage.set(row.message_id, []);
    byMessage.get(row.message_id).push({ user_id: row.user_id, reaction: row.reaction });
  }
  return rows.map((r) => ({ ...r, reactions: byMessage.get(r.id) || [] }));
}

module.exports = { attachReplyPreviews, attachReactions, scrubDeletedContent };
