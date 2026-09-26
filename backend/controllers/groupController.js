const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getIO } = require('../sockets');

// B10 group chat. Rules:
// - A group has a name (1-100 chars) and 2..MAX_GROUP_SIZE members
//   including its creator, who starts as its admin.
// - Admins can add members, remove members and rename; anyone can leave.
// - You can't add someone you've blocked or who has blocked you, or a
//   deactivated account. (Blocks don't silence an existing group -- see
//   messageService.assertNotBlocked.)
// - If the last admin leaves, the longest-standing remaining member is
//   promoted; when the last member leaves, the group is deleted.
const MAX_GROUP_SIZE = 50;
const MAX_NAME_LENGTH = 100;

class GroupError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) throw new GroupError(400, 'A group needs a name');
  if (name.length > MAX_NAME_LENGTH) throw new GroupError(400, `Group name must be ${MAX_NAME_LENGTH} characters or fewer`);
  return name;
}

// Validates a list of user ids to put in a group alongside `actorId`:
// integers, existing, active, and no block either way with the actor.
async function validateMemberIds(rawIds, actorId) {
  if (!Array.isArray(rawIds)) throw new GroupError(400, 'userIds must be an array');
  const ids = [...new Set(rawIds.map(Number))].filter((id) => id !== actorId);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new GroupError(400, 'Invalid user id');
  if (ids.length === 0) return [];
  const result = await db.query(
    `SELECT u.id FROM users u
     WHERE u.id = ANY($1::int[]) AND NOT u.is_deactivated
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $2 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $2)
       )`,
    [ids, actorId]
  );
  if (result.rows.length !== ids.length) {
    throw new GroupError(400, "Some of those people can't be added");
  }
  return ids;
}

async function getGroupForMember(conversationId, userId) {
  const result = await db.query(
    `SELECT c.id, c.type, c.name, cp.role
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $2
     WHERE c.id = $1`,
    [conversationId, userId]
  );
  const row = result.rows[0];
  if (!row) throw new GroupError(403, 'You are not a participant in this conversation');
  if (row.type !== 'group') throw new GroupError(400, 'This is not a group conversation');
  return row;
}

async function getMembers(conversationId) {
  const result = await db.query(
    `SELECT u.id, u.username, u.avatar_url, cp.role, cp.joined_at
     FROM conversation_participants cp JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = $1
     ORDER BY (cp.role = 'admin') DESC, cp.joined_at ASC, u.id ASC`,
    [conversationId]
  );
  return result.rows;
}

// Moves these users' live sockets into/out of the conversation's room
// (sockets also join a personal user_<id> room on connect).
function syncRooms(conversationId, userIds, action) {
  try {
    const io = getIO();
    for (const id of userIds) {
      const target = io.in(`user_${id}`);
      if (action === 'join') target.socketsJoin(`conv_${conversationId}`);
      else target.socketsLeave(`conv_${conversationId}`);
    }
  } catch (err) {
    // No socket server (e.g. tests) -- REST still works; clients refetch.
  }
}

function emitGroupUpdated(conversationId, extraUserIds = []) {
  try {
    const io = getIO();
    io.to(`conv_${conversationId}`).emit('group_updated', { conversationId });
    for (const id of extraUserIds) io.to(`user_${id}`).emit('group_updated', { conversationId });
  } catch (err) {
    // see syncRooms
  }
}

function handle(res, err, fallback) {
  if (err instanceof GroupError) return res.status(err.status).send(err.message);
  return sendServerError(res, err, fallback);
}

// POST /conversations/groups { name, userIds }
async function createGroup(req, res) {
  try {
    const name = cleanName(req.body.name);
    const memberIds = await validateMemberIds(req.body.userIds, req.userId);
    if (memberIds.length === 0) throw new GroupError(400, 'Add at least one other person');
    if (memberIds.length + 1 > MAX_GROUP_SIZE) throw new GroupError(400, `A group can have at most ${MAX_GROUP_SIZE} members`);

    // One statement: the conversation and all its participants, or nothing.
    const result = await db.query(
      `WITH c AS (
         INSERT INTO conversations (type, name, created_by) VALUES ('group', $1, $2) RETURNING id
       ), p AS (
         INSERT INTO conversation_participants (conversation_id, user_id, role)
         SELECT c.id, m.id, CASE WHEN m.id = $2 THEN 'admin' ELSE 'member' END
         FROM c, unnest($3::int[]) AS m(id)
       )
       SELECT id FROM c`,
      [name, req.userId, [req.userId, ...memberIds]]
    );
    const conversationId = result.rows[0].id;
    syncRooms(conversationId, [req.userId, ...memberIds], 'join');
    emitGroupUpdated(conversationId);
    res.status(201).json({ id: conversationId, type: 'group', name, members: await getMembers(conversationId), my_role: 'admin' });
  } catch (err) {
    handle(res, err, 'Creating the group failed. Please try again later.');
  }
}

// GET /conversations/:id -- details for a participant (direct or group).
async function getConversationDetails(req, res) {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId)) throw new GroupError(400, 'Invalid conversation ID');
    const result = await db.query(
      `SELECT c.id, c.type, c.name, c.created_by, cp.role AS my_role
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $2
       WHERE c.id = $1`,
      [conversationId, req.userId]
    );
    if (!result.rows[0]) throw new GroupError(403, 'You are not a participant in this conversation');
    res.json({ ...result.rows[0], members: await getMembers(conversationId) });
  } catch (err) {
    handle(res, err, 'Loading the conversation failed. Please try again later.');
  }
}

// POST /conversations/:id/members { userIds } -- admins only.
async function addMembers(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const group = await getGroupForMember(conversationId, req.userId);
    if (group.role !== 'admin') throw new GroupError(403, 'Only group admins can add people');
    const ids = await validateMemberIds(req.body.userIds, req.userId);
    if (ids.length === 0) throw new GroupError(400, 'Choose at least one person to add');

    const count = await db.query('SELECT COUNT(*)::int AS n FROM conversation_participants WHERE conversation_id = $1', [conversationId]);
    const existing = await db.query(
      'SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id = ANY($2::int[])',
      [conversationId, ids]
    );
    const fresh = ids.filter((id) => !existing.rows.some((r) => r.user_id === id));
    if (count.rows[0].n + fresh.length > MAX_GROUP_SIZE) {
      throw new GroupError(400, `A group can have at most ${MAX_GROUP_SIZE} members`);
    }
    if (fresh.length > 0) {
      await db.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role)
         SELECT $1, id, 'member' FROM unnest($2::int[]) AS t(id)
         ON CONFLICT DO NOTHING`,
        [conversationId, fresh]
      );
      syncRooms(conversationId, fresh, 'join');
      emitGroupUpdated(conversationId);
    }
    res.json({ members: await getMembers(conversationId), added: fresh });
  } catch (err) {
    handle(res, err, 'Adding people failed. Please try again later.');
  }
}

// DELETE /conversations/:id/members/:userId -- leave (yourself) or remove
// someone (admins only).
async function removeMember(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const targetId = Number(req.params.userId);
    if (!Number.isInteger(targetId)) throw new GroupError(400, 'Invalid user ID');
    const group = await getGroupForMember(conversationId, req.userId);
    const leaving = targetId === req.userId;
    if (!leaving && group.role !== 'admin') throw new GroupError(403, 'Only group admins can remove people');

    const removed = await db.query(
      'DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 RETURNING role',
      [conversationId, targetId]
    );
    if (removed.rows.length === 0) throw new GroupError(404, 'That person is not in this group');
    syncRooms(conversationId, [targetId], 'leave');

    const remaining = await getMembers(conversationId);
    if (remaining.length === 0) {
      await db.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      return res.json({ members: [], deleted: true });
    }
    // Never leave a group without an admin.
    if (!remaining.some((m) => m.role === 'admin')) {
      const heir = remaining.slice().sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at) || a.id - b.id)[0];
      await db.query(
        "UPDATE conversation_participants SET role = 'admin' WHERE conversation_id = $1 AND user_id = $2",
        [conversationId, heir.id]
      );
    }
    // Someone removed by an admin is told too (their open chat then shows
    // "no longer in this conversation"); someone who left did it themselves.
    emitGroupUpdated(conversationId, leaving ? [] : [targetId]);
    res.json({ members: await getMembers(conversationId), deleted: false });
  } catch (err) {
    handle(res, err, 'Updating the group failed. Please try again later.');
  }
}

// PATCH /conversations/:id { name } -- admins only.
async function renameGroup(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const group = await getGroupForMember(conversationId, req.userId);
    if (group.role !== 'admin') throw new GroupError(403, 'Only group admins can rename the group');
    const name = cleanName(req.body.name);
    await db.query('UPDATE conversations SET name = $1 WHERE id = $2', [name, conversationId]);
    emitGroupUpdated(conversationId);
    res.json({ id: conversationId, name });
  } catch (err) {
    handle(res, err, 'Renaming the group failed. Please try again later.');
  }
}

module.exports = { createGroup, getConversationDetails, addMembers, removeMember, renameGroup, MAX_GROUP_SIZE };
