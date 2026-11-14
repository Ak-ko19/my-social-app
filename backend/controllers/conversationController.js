// The chat list: your inbox (paged, searchable, pinned and archived
// chats), opening a direct chat, and your own mute / pin / archive of a
// chat. Day 116: a chat's messages are in messageController.js; group
// chats' members and settings in groupController.js.
const db = require('../db');
const { sendError } = require('../utils/httpError');
const { escapeLike } = require('../utils/escapeLike');
const { encodeCursor, decodeCursor, getLimit } = require('../utils/cursorPagination');
const messageService = require('../services/messageService');
const blockService = require('../services/blockService');
const { syncRooms } = require('../sockets');
const presence = require('../sockets/presence');

// Day 70: GET /conversations?cursor=&limit=&q= -- your chats, most recent
// activity first, a page at a time ({ conversations, nextCursor }); q keeps
// only chats whose name (a group's, or the other person's username)
// contains it. ?id= answers just that one chat, in the same shape (a chat's
// header uses it). The page is picked first -- each chat's last activity,
// keyset by conversation id, compared in SQL so no timestamp goes through a
// JS Date -- and the details below are read for those chats only.
// Days 97-98: pinned chats come first (the most recently pinned first, at
// most 3), all on the first page; the cursor pages the others. ?archived=1
// ($5) lists the archived chats instead of the inbox. (The cursor's chat is
// looked up in all your chats, so archiving it meanwhile loses no place.)
const INBOX_PAGE_SQL = `
  WITH mine AS (
    SELECT c.id, COALESCE(lm.created_at, c.created_at) AS activity_at, cp.pinned_at, cp.archived_at,
      CASE WHEN c.type = 'group' THEN c.name ELSE (
        SELECT u.username FROM conversation_participants o JOIN users u ON u.id = o.user_id
        WHERE o.conversation_id = c.id AND o.user_id <> $1 LIMIT 1
      ) END AS name
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    LEFT JOIN LATERAL (
      SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) lm ON true
    WHERE cp.user_id = $1
  ),
  found AS (
    SELECT * FROM mine WHERE (archived_at IS NOT NULL) = $5 AND ($3 = '' OR name ILIKE '%' || $3 || '%')
  )
  (SELECT id, pinned_at, activity_at FROM found WHERE pinned_at IS NOT NULL AND $2::int IS NULL)
  UNION ALL
  (SELECT id, pinned_at, activity_at FROM found
   WHERE pinned_at IS NULL AND ($2::int IS NULL OR (activity_at, id) < (SELECT activity_at, id FROM mine WHERE id = $2))
   ORDER BY activity_at DESC, id DESC
   LIMIT $4)
  ORDER BY pinned_at DESC NULLS LAST, activity_at DESC, id DESC`;

async function getConversations(req, res) {
  try {
    let ids;
    let nextCursor = null;
    let archived = false;
    let archivedCount;
    if (req.query.id !== undefined) {
      const one = Number(req.query.id);
      if (!Number.isInteger(one) || one < 1) return res.status(400).send('Invalid conversation ID');
      ids = [one];
    } else {
      const limit = getLimit(req, { defaultLimit: 20, maxLimit: 50 });
      let cursor;
      try {
        cursor = decodeCursor(req.query.cursor);
      } catch (err) {
        return res.status(400).send('Invalid cursor');
      }
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      if (![undefined, '0', '1'].includes(req.query.archived)) return res.status(400).send('archived must be 0 or 1');
      archived = req.query.archived === '1';
      const page = await db.query(INBOX_PAGE_SQL, [req.userId, cursor?.id ?? null, escapeLike(q), limit + 1, archived]);
      const pinned = page.rows.filter((r) => r.pinned_at);
      const rest = page.rows.filter((r) => !r.pinned_at);
      ids = [...pinned, ...rest.slice(0, limit)].map((r) => r.id);
      if (rest.length > limit) nextCursor = encodeCursor({ id: rest[limit - 1].id });
      // The inbox's first page says how many chats are archived ("Archived
      // chats (2)").
      if (!archived && !cursor) {
        archivedCount = (await db.query(
          'SELECT COUNT(*)::int AS n FROM conversation_participants WHERE user_id = $1 AND archived_at IS NOT NULL', [req.userId]
        )).rows[0].n;
      }
    }

    // Direct chats: exactly 2 participants (type = 'direct').
    const result = await db.query(`
      SELECT
        c.id AS conversation_id,
        other.id AS other_user_id,
        other.username,
        other.avatar_url,
        other.last_seen,
        lm.id AS last_message_id,
        -- Media messages have no (or only caption) content, so label them;
        -- keep in sync with the frontend's messagePreviewText().
        CASE
          WHEN lm.deleted_at IS NOT NULL THEN 'This message was deleted'
          WHEN lm.type = 'voice' THEN 'Voice message'
          WHEN lm.type = 'image' THEN COALESCE('Photo: ' || NULLIF(lm.content, ''), 'Photo')
          ELSE lm.content
        END AS last_message,
        lm.created_at AS last_message_at,
        COALESCE(lm.created_at, c.created_at) AS activity_at,
        COALESCE(unread.count, 0)::int AS unread_count,
        -- Day 23: muted for you (no message notifications)
        COALESCE(cp.muted_until > now(), false) AS muted,
        -- Days 97-98: yours only.
        cp.pinned_at IS NOT NULL AS pinned,
        cp.archived_at IS NOT NULL AS archived
      FROM conversation_participants cp
      JOIN conversations c ON c.id = cp.conversation_id AND c.type = 'direct'
      JOIN conversation_participants other_cp
        ON other_cp.conversation_id = c.id AND other_cp.user_id != cp.user_id
      JOIN users other ON other.id = other_cp.user_id
      LEFT JOIN LATERAL (
        -- Deliberately NOT filtering out deleted_at here (unlike the
        -- unread-count lateral below) -- the true last message is wanted
        -- even if it was deleted, so its preview can say so below instead
        -- of silently falling back to an older, no-longer-current message.
        SELECT id, content, type, created_at, deleted_at
        FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id != $1
          AND m.deleted_at IS NULL
          -- Day 27: COALESCE, not "IS NULL OR": the same rows (ids start at
          -- 1), but Postgres can then read just this id range from
          -- idx_messages_conversation_id instead of the whole conversation.
          AND m.id > COALESCE(cp.last_read_message_id, 0)
      ) unread ON true
      WHERE cp.user_id = $1 AND c.id = ANY($2::int[])
    `, [req.userId, ids]);

    // Presence is in-memory/per-process (see sockets/presence.js), not a
    // DB column, so it's annotated onto each row here rather than joined
    // in SQL.
    const rows = result.rows.map((row) => ({
      ...row,
      type: 'direct',
      is_online: presence.isOnline(row.other_user_id)
    }));

    // B10 group conversations. Same row shape as direct ones (so the inbox
    // renders them unchanged: `username` carries the group name), plus
    // type/name/member_count. The preview names the sender -- in a group
    // "who said it" matters.
    const groups = await db.query(`
      SELECT
        c.id AS conversation_id,
        'group' AS type,
        c.name,
        c.name AS username,
        NULL::int AS other_user_id,
        c.avatar_url,
        (SELECT COUNT(*)::int FROM conversation_participants m WHERE m.conversation_id = c.id) AS member_count,
        lm.id AS last_message_id,
        CASE
          WHEN lm.id IS NULL THEN NULL
          ELSE (CASE WHEN lm.sender_id = $1 THEN 'You' ELSE sender.username END) || ': ' ||
            CASE
              WHEN lm.deleted_at IS NOT NULL THEN 'This message was deleted'
              WHEN lm.type = 'voice' THEN 'Voice message'
              WHEN lm.type = 'image' THEN COALESCE('Photo: ' || NULLIF(lm.content, ''), 'Photo')
              ELSE lm.content
            END
        END AS last_message,
        lm.created_at AS last_message_at,
        COALESCE(lm.created_at, c.created_at) AS activity_at,
        COALESCE(unread.count, 0)::int AS unread_count,
        COALESCE(cp.muted_until > now(), false) AS muted,
        -- Days 97-98: yours only.
        cp.pinned_at IS NOT NULL AS pinned,
        cp.archived_at IS NOT NULL AS archived
      FROM conversation_participants cp
      JOIN conversations c ON c.id = cp.conversation_id AND c.type = 'group'
      LEFT JOIN LATERAL (
        SELECT id, sender_id, content, type, created_at, deleted_at
        FROM messages m WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1
      ) lm ON true
      LEFT JOIN users sender ON sender.id = lm.sender_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count FROM messages m
        WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.deleted_at IS NULL
          -- Day 27: COALESCE, not "IS NULL OR": the same rows (ids start at
          -- 1), but Postgres can then read just this id range from
          -- idx_messages_conversation_id instead of the whole conversation.
          AND m.id > COALESCE(cp.last_read_message_id, 0)
      ) unread ON true
      WHERE cp.user_id = $1 AND c.id = ANY($2::int[])
    `, [req.userId, ids]);

    // In the page's order (most recent activity first; a chat with no
    // messages yet by when it was created).
    const byId = new Map([...rows, ...groups.rows.map((g) => ({ ...g, is_online: false }))].map((c) => [c.conversation_id, c]));
    const conversations = ids.map((id) => byId.get(id)).filter(Boolean);
    if (req.query.id !== undefined && conversations.length === 0) return res.status(404).send('Conversation not found');
    res.json({ conversations, nextCursor, ...(archivedCount !== undefined && { archivedCount }) });
  } catch (err) {
    sendError(res, err, 'Fetch conversations failed. Please try again later.');
  }
}

async function createConversation(req, res) {
  try {
    const targetUserId = parseInt(req.body.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).send('A valid userId is required');
    }
    if (targetUserId === req.userId) {
      return res.status(400).send('You cannot start a conversation with yourself');
    }

    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    if (await blockService.isBlocked(req.userId, targetUserId)) {
      return res.status(403).send('You cannot message this user');
    }

    // Day 100: shared with story replies (messageService.openDirectChat):
    // an existing chat opens either way; a new one needs the other person
    // to accept messages from you (Day 47), and two requests racing to
    // open it get the same row.
    const { conversation, created } = await messageService.openDirectChat(req.userId, targetUserId);
    // Day 64: both people's open sockets join the new chat's room now, or
    // its first messages only appear after a reload (found by journeys-core).
    if (created) syncRooms(conversation.id, [req.userId, targetUserId], 'join');

    const other = await db.query('SELECT id, username, avatar_url FROM users WHERE id = $1', [targetUserId]);
    res.status(created ? 201 : 200).json({
      ...conversation,
      other_user_id: other.rows[0].id,
      username: other.rows[0].username,
      avatar_url: other.rows[0].avatar_url
    });
  } catch (err) {
    sendError(res, err, 'Create conversation failed. Please try again later.');
  }
}


// Day 23: PUT /conversations/:id/mute { duration: '8h' | '1w' | 'always' | null }
// -- no message notifications from this chat for that long (null = unmute).
// Only for people in the conversation; anyone else gets the same 404 as a
// conversation that doesn't exist.
const MUTE_DURATIONS = { '8h': "now() + interval '8 hours'", '1w': "now() + interval '7 days'", always: "'infinity'::timestamptz" };

async function muteConversation(req, res) {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId)) return res.status(400).send('Invalid conversation ID');
    const duration = req.body?.duration ?? null;
    if (duration !== null && !Object.hasOwn(MUTE_DURATIONS, duration)) {
      return res.status(400).send(`duration must be one of: ${Object.keys(MUTE_DURATIONS).join(', ')}, or null`);
    }
    // The interval comes only from the fixed map above, never from input.
    const result = await db.query(
      `UPDATE conversation_participants SET muted_until = ${duration === null ? 'NULL' : MUTE_DURATIONS[duration]}
       WHERE conversation_id = $1 AND user_id = $2
       RETURNING COALESCE(muted_until > now(), false) AS muted,
         CASE WHEN muted_until > now() AND muted_until <> 'infinity' THEN muted_until END AS muted_until`,
      [conversationId, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).send('Conversation not found');
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Muting the conversation failed. Please try again later.');
  }
}

// Days 97-98: PUT /conversations/:id/pin { pinned } and
// PUT /conversations/:id/archive { archived } -- your own inbox only (like
// mute: anyone not in the chat gets a 404). Up to MAX_PINNED pinned;
// pinning brings an archived chat back, archiving unpins.
const MAX_PINNED = 3;
const TOO_MANY_PINNED = `You can pin up to ${MAX_PINNED} chats.`;

async function setChatPlace(req, res, field) {
  const conversationId = Number(req.params.id);
  if (!Number.isInteger(conversationId)) return res.status(400).send('Invalid conversation ID');
  const on = req.body?.[field];
  if (typeof on !== 'boolean') return res.status(400).send(field === 'pinned' ? 'pinned must be true or false' : 'archived must be true or false');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Your participant rows, locked: two pins at once can't make a fourth.
    const mine = await client.query(
      'SELECT conversation_id, pinned_at FROM conversation_participants WHERE user_id = $1 ORDER BY conversation_id FOR UPDATE', [req.userId]
    );
    const row = mine.rows.find((r) => r.conversation_id === conversationId);
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(404).send('Conversation not found');
    }
    if (field === 'pinned' && on && !row.pinned_at && mine.rows.filter((r) => r.pinned_at).length >= MAX_PINNED) {
      await client.query('ROLLBACK');
      return res.status(400).send(TOO_MANY_PINNED);
    }
    // The SQL comes only from these fixed strings, never from input.
    const set = field === 'pinned'
      ? (on ? 'pinned_at = COALESCE(pinned_at, now()), archived_at = NULL' : 'pinned_at = NULL')
      : (on ? 'archived_at = COALESCE(archived_at, now()), pinned_at = NULL' : 'archived_at = NULL');
    const result = await client.query(
      `UPDATE conversation_participants SET ${set} WHERE conversation_id = $1 AND user_id = $2
       RETURNING pinned_at IS NOT NULL AS pinned, archived_at IS NOT NULL AS archived`,
      [conversationId, req.userId]
    );
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function pinConversation(req, res) {
  try {
    await setChatPlace(req, res, 'pinned');
  } catch (err) {
    sendError(res, err, 'Pinning the chat failed. Please try again later.');
  }
}

async function archiveConversation(req, res) {
  try {
    await setChatPlace(req, res, 'archived');
  } catch (err) {
    sendError(res, err, 'Archiving the chat failed. Please try again later.');
  }
}

module.exports = {
  getConversations,
  createConversation,
  muteConversation,
  pinConversation,
  archiveConversation
};
