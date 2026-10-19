const { HttpError, sendError } = require('../utils/httpError');
const { noBlockBetweenSql } = require('../services/blockService');
const db = require('../db');
const { mediaOfConversation, deleteMedia } = require('../services/mediaCleanupService');
const { getIO, syncRooms } = require('../sockets');
const { toUnicode } = require('../utils/myanmarText'); // Day 43: Zawgyi -> Unicode

// B10 group chat. Rules:
// - A group has a name (1-100 chars) and 2..MAX_GROUP_SIZE members
//   including its creator, who starts as its admin.
// - Admins can add members, remove members and rename; anyone can leave.
// - Day 33: admins can make others admins or remove that role (their own
//   too), but a group always keeps at least one admin.
// - You can't add someone you've blocked or who has blocked you, or a
//   deactivated account. (Blocks don't silence an existing group -- see
//   messageService.assertNotBlocked.)
// - If the last admin leaves, the longest-standing remaining member is
//   promoted; when the last member leaves, the group is deleted.
const MAX_GROUP_SIZE = 50;
const MAX_NAME_LENGTH = 100;

class GroupError extends HttpError {}

function cleanName(raw) {
  const name = typeof raw === 'string' ? toUnicode(raw).trim() : '';
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
       AND ${noBlockBetweenSql('$2', 'u.id')}`,
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

function emitGroupUpdated(conversationId, extraUserIds = []) {
  try {
    const io = getIO();
    io.to(`conv_${conversationId}`).emit('group_updated', { conversationId });
    for (const id of extraUserIds) io.to(`user_${id}`).emit('group_updated', { conversationId });
  } catch (err) {
    // No socket server (e.g. tests) -- REST still works; clients refetch.
  }
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
    sendError(res, err, 'Creating the group failed. Please try again later.');
  }
}

// GET /conversations/:id -- details for a participant (direct or group).
async function getConversationDetails(req, res) {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId)) throw new GroupError(400, 'Invalid conversation ID');
    const result = await db.query(
      `SELECT c.id, c.type, c.name, c.avatar_url, c.created_by, cp.role AS my_role,
         -- Day 23: muted for you; muted_until 'infinity' = until unmuted
         COALESCE(cp.muted_until > now(), false) AS muted,
         CASE WHEN cp.muted_until > now() AND cp.muted_until <> 'infinity' THEN cp.muted_until END AS muted_until
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $2
       WHERE c.id = $1`,
      [conversationId, req.userId]
    );
    if (!result.rows[0]) throw new GroupError(403, 'You are not a participant in this conversation');
    res.json({ ...result.rows[0], members: await getMembers(conversationId) });
  } catch (err) {
    sendError(res, err, 'Loading the conversation failed. Please try again later.');
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
    sendError(res, err, 'Adding people failed. Please try again later.');
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
      // The last member left: the chat and every photo/voice note in it go.
      const media = await mediaOfConversation(conversationId);
      await db.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      deleteMedia(media);
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
    sendError(res, err, 'Updating the group failed. Please try again later.');
  }
}

// Day 33: sets one member's role; removing an admin role only goes through
// while another admin remains. Its CTE locks the group's rows first
// (exported for the test that proves it).
const SET_ROLE_SQL = `WITH locked AS (
    SELECT user_id, role FROM conversation_participants WHERE conversation_id = $1 FOR UPDATE
  )
  UPDATE conversation_participants cp SET role = $3
  WHERE cp.conversation_id = $1 AND cp.user_id = $2
    AND ($3 = 'admin' OR EXISTS (SELECT 1 FROM locked WHERE role = 'admin' AND user_id <> $2))
  RETURNING cp.role`;

// Day 33: PATCH /conversations/:id/members/:userId { role: 'admin' | 'member' }
// -- admins only. One statement: it locks the group's rows first, so two
// admins removing each other's role at the same moment can't leave the
// group with none (the second waits, then sees the first's change).
async function setMemberRole(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const targetId = Number(req.params.userId);
    if (!Number.isInteger(targetId)) throw new GroupError(400, 'Invalid user ID');
    const role = req.body?.role;
    if (role !== 'admin' && role !== 'member') throw new GroupError(400, "role must be 'admin' or 'member'");
    const group = await getGroupForMember(conversationId, req.userId);
    if (group.role !== 'admin') throw new GroupError(403, 'Only group admins can change who is an admin');

    const updated = await db.query(SET_ROLE_SQL, [conversationId, targetId, role]);
    if (updated.rows.length === 0) {
      const member = await db.query('SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2', [conversationId, targetId]);
      if (member.rows.length === 0) throw new GroupError(404, 'That person is not in this group');
      throw new GroupError(409, 'A group needs at least one admin');
    }
    emitGroupUpdated(conversationId);
    res.json({ members: await getMembers(conversationId) });
  } catch (err) {
    sendError(res, err, 'Updating the group failed. Please try again later.');
  }
}

// Day 34: group photo. requireGroupAdmin runs BEFORE the upload middleware,
// so someone who may not change the photo never uploads a file at all.
async function requireGroupAdmin(req, res, next) {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId)) throw new GroupError(400, 'Invalid conversation ID');
    const group = await getGroupForMember(conversationId, req.userId);
    if (group.role !== 'admin') throw new GroupError(403, 'Only group admins can change the group photo');
    next();
  } catch (err) {
    sendError(res, err, 'Updating the group failed. Please try again later.');
  }
}

// Sets (url) or removes (null) the photo; the old file is deleted.
async function replaceGroupPhoto(conversationId, url) {
  const previous = await db.query('SELECT avatar_url FROM conversations WHERE id = $1', [conversationId]);
  await db.query('UPDATE conversations SET avatar_url = $1 WHERE id = $2', [url, conversationId]);
  const old = previous.rows[0]?.avatar_url;
  if (old && old !== url) deleteMedia([old]);
  emitGroupUpdated(conversationId);
}

// PUT /conversations/:id/photo (multipart "photo") -- admins only.
async function setGroupPhoto(req, res) {
  try {
    if (!req.cloudinaryResult) throw new GroupError(400, 'Choose a photo');
    const url = req.cloudinaryResult.secure_url;
    await replaceGroupPhoto(Number(req.params.id), url);
    res.json({ avatar_url: url });
  } catch (err) {
    sendError(res, err, 'Updating the group photo failed. Please try again later.');
  }
}

// DELETE /conversations/:id/photo -- admins only.
async function removeGroupPhoto(req, res) {
  try {
    await replaceGroupPhoto(Number(req.params.id), null);
    res.json({ avatar_url: null });
  } catch (err) {
    sendError(res, err, 'Updating the group photo failed. Please try again later.');
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
    sendError(res, err, 'Renaming the group failed. Please try again later.');
  }
}

module.exports = { createGroup, getConversationDetails, addMembers, removeMember, renameGroup, setMemberRole, requireGroupAdmin, setGroupPhoto, removeGroupPhoto, SET_ROLE_SQL, MAX_GROUP_SIZE };
