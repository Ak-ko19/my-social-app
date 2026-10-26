// Day 99: search inside one of your chats (Messenger / WhatsApp "Search in
// conversation"), and the messages around a result. Your chats only, like
// the history (403 otherwise). The search reads that one chat's messages
// through idx_messages_conversation_id -- fine at chat sizes; a trigram
// index on messages.content would be the step if chats grow very long.
const db = require('../db');
const { sendError } = require('../utils/httpError');
const { escapeLike } = require('../utils/escapeLike');
const { toUnicode } = require('../utils/myanmarText');
const { textOf } = require('../utils/bodyText');
const { encodeCursor, decodeCursor, getLimit } = require('../utils/cursorPagination');
const messageService = require('../services/messageService');

const MIN_QUERY = 2;
const MAX_QUERY = 100;
const QUERY_TOO_SHORT = 'Search for at least 2 characters.';
const CONTEXT_EACH_SIDE = 10;

async function participantOr403(req, res) {
  const conversationId = Number(req.params.id);
  if (!Number.isInteger(conversationId)) {
    res.status(400).send('Invalid conversation ID');
    return null;
  }
  if (!(await messageService.isParticipant(conversationId, req.userId))) {
    res.status(403).send('You are not a participant in this conversation');
    return null;
  }
  return conversationId;
}

// GET /conversations/:id/search?q=&cursor=&limit= -- text messages and
// photo captions containing q (not deleted ones; voice has no text),
// newest first, a page at a time ({ results, nextCursor }).
async function searchMessages(req, res) {
  try {
    const conversationId = await participantOr403(req, res);
    if (conversationId === null) return;
    const q = toUnicode(textOf(req.query.q).trim()).slice(0, MAX_QUERY);
    if (q.length < MIN_QUERY) return res.status(400).send(QUERY_TOO_SHORT);
    const limit = getLimit(req, { defaultLimit: 20, maxLimit: 50 });
    let cursor;
    try {
      cursor = decodeCursor(req.query.cursor);
    } catch {
      return res.status(400).send('Invalid cursor');
    }
    // Keyset by the cursor message's own (created_at, id), as the history.
    const result = await db.query(
      `SELECT m.id, m.sender_id, u.username AS sender_username, m.type, m.content, m.created_at
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 AND m.deleted_at IS NULL AND m.type IN ('text', 'image')
         AND m.content ILIKE '%' || $2 || '%'
         AND ($3::int IS NULL OR (m.created_at, m.id) < (
           SELECT c.created_at, c.id FROM messages c WHERE c.id = $3 AND c.conversation_id = $1
         ))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $4`,
      [conversationId, escapeLike(q), cursor?.id ?? null, limit + 1]
    );
    const results = result.rows.slice(0, limit);
    const nextCursor = result.rows.length > limit ? encodeCursor({ id: results[results.length - 1].id }) : null;
    res.json({ results, nextCursor });
  } catch (err) {
    sendError(res, err, 'Searching the chat failed. Please try again later.');
  }
}

// GET /conversations/:id/messages/:messageId/context -- that message with
// up to 10 before and 10 after it, oldest first, shaped like the history
// (reply previews, reactions, deleted ones without content).
async function messageContext(req, res) {
  try {
    const conversationId = await participantOr403(req, res);
    if (conversationId === null) return;
    const messageId = Number(req.params.messageId);
    if (!Number.isInteger(messageId)) return res.status(400).send('Invalid message ID');
    const target = await db.query(
      'SELECT id FROM messages WHERE id = $1 AND conversation_id = $2 AND deleted_at IS NULL',
      [messageId, conversationId]
    );
    if (target.rows.length === 0) return res.status(404).send('Message not found');
    const result = await db.query(
      `WITH t AS (SELECT created_at, id FROM messages WHERE id = $2)
       (SELECT m.* FROM messages m, t WHERE m.conversation_id = $1 AND (m.created_at, m.id) < (t.created_at, t.id)
        ORDER BY m.created_at DESC, m.id DESC LIMIT $3)
       UNION ALL
       (SELECT m.* FROM messages m, t WHERE m.conversation_id = $1 AND (m.created_at, m.id) >= (t.created_at, t.id)
        ORDER BY m.created_at, m.id LIMIT $3 + 1)
       ORDER BY created_at, id`,
      [conversationId, messageId, CONTEXT_EACH_SIDE]
    );
    const shaped = await messageService.attachReactions(await messageService.attachReplyPreviews(conversationId, result.rows));
    res.json({ messageId, messages: shaped.map(messageService.scrubDeletedContent) });
  } catch (err) {
    sendError(res, err, 'Loading the messages failed. Please try again later.');
  }
}

module.exports = { searchMessages, messageContext, QUERY_TOO_SHORT };
