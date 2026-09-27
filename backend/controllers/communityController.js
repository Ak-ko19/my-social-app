const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql } = require('../services/reactionService');

// B13 Groups ("communities" in the code, to stay distinct from B10 group
// chats). Rules:
// - public: anyone can read; joining is instant.
// - private: name/description/member count are visible to everyone (so
//   people can find and request to join), posts only to members; joining
//   creates a 'pending' request an admin approves or denies.
// - The creator starts as admin. Admins approve/deny requests, remove
//   members, promote/demote, edit the group, and delete any post in it.
// - The last admin leaving promotes the longest-standing member; the last
//   member leaving deletes the group (and its posts).

class CommunityError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const handle = (res, err, fallback) =>
  err instanceof CommunityError ? res.status(err.status).send(err.message) : sendServerError(res, err, fallback);

function cleanFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new CommunityError(400, 'A group needs a name');
    if (name.length > 100) throw new CommunityError(400, 'Group name must be 100 characters or fewer');
    out.name = name;
  }
  if (!partial || body.description !== undefined) {
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length > 1000) throw new CommunityError(400, 'Description must be 1000 characters or fewer');
    out.description = description || null;
  }
  if (!partial || body.privacy !== undefined) {
    const privacy = body.privacy === undefined ? 'public' : body.privacy;
    if (!['public', 'private'].includes(privacy)) throw new CommunityError(400, 'privacy must be public or private');
    out.privacy = privacy;
  }
  return out;
}

// The community plus the viewer's relationship to it.
async function loadCommunity(communityId, viewerId) {
  if (!Number.isInteger(communityId)) throw new CommunityError(400, 'Invalid group ID');
  const result = await db.query(
    `SELECT c.id, c.name, c.description, c.privacy, c.created_at,
       (SELECT COUNT(*)::int FROM community_members m WHERE m.community_id = c.id AND m.status = 'member') AS member_count,
       me.role AS my_role, me.status AS my_status
     FROM communities c
     LEFT JOIN community_members me ON me.community_id = c.id AND me.user_id = $2
     WHERE c.id = $1`,
    [communityId, viewerId ?? null]
  );
  const c = result.rows[0];
  if (!c) throw new CommunityError(404, 'Group not found');
  c.is_member = c.my_status === 'member';
  c.is_admin = c.is_member && c.my_role === 'admin';
  c.can_read = c.privacy === 'public' || c.is_member;
  return c;
}

const requireAdmin = (c) => {
  if (!c.is_admin) throw new CommunityError(403, 'Only group admins can do that');
};

// Never leave a group without an admin; delete it when nobody's left.
async function ensureAdminOrDelete(communityId) {
  const members = await db.query(
    "SELECT user_id, role FROM community_members WHERE community_id = $1 AND status = 'member' ORDER BY joined_at ASC, user_id ASC",
    [communityId]
  );
  if (members.rows.length === 0) {
    await db.query('DELETE FROM communities WHERE id = $1', [communityId]);
    return { deleted: true };
  }
  if (!members.rows.some((m) => m.role === 'admin')) {
    await db.query("UPDATE community_members SET role = 'admin' WHERE community_id = $1 AND user_id = $2", [communityId, members.rows[0].user_id]);
  }
  return { deleted: false };
}

// POST /communities { name, description?, privacy? }
async function createCommunity(req, res) {
  try {
    const fields = cleanFields(req.body);
    const result = await db.query(
      `WITH c AS (
         INSERT INTO communities (name, description, privacy, created_by) VALUES ($1, $2, $3, $4) RETURNING id
       ), m AS (
         INSERT INTO community_members (community_id, user_id, role, status) SELECT id, $4, 'admin', 'member' FROM c
       )
       SELECT id FROM c`,
      [fields.name, fields.description, fields.privacy, req.userId]
    );
    res.status(201).json(await loadCommunity(result.rows[0].id, req.userId));
  } catch (err) {
    handle(res, err, 'Creating the group failed. Please try again later.');
  }
}

// GET /communities -> { mine: [...], discover: [...] }. "mine" includes
// groups you've requested to join (my_status 'pending'); "discover" lists
// other groups (public and private), most members first.
async function listCommunities(req, res) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const result = await db.query(
      `SELECT c.id, c.name, c.description, c.privacy,
         (SELECT COUNT(*)::int FROM community_members m WHERE m.community_id = c.id AND m.status = 'member') AS member_count,
         me.role AS my_role, me.status AS my_status
       FROM communities c
       LEFT JOIN community_members me ON me.community_id = c.id AND me.user_id = $1
       WHERE ($2 = '' OR c.name ILIKE '%' || $2 || '%')
       ORDER BY member_count DESC, c.id DESC
       LIMIT 100`,
      [req.userId, q.replace(/[%_\\]/g, (ch) => `\\${ch}`)]
    );
    res.json({
      mine: result.rows.filter((c) => c.my_status),
      discover: result.rows.filter((c) => !c.my_status)
    });
  } catch (err) {
    handle(res, err, 'Loading groups failed. Please try again later.');
  }
}

// GET /communities/:id
async function getCommunity(req, res) {
  try {
    res.json(await loadCommunity(Number(req.params.id), req.userId));
  } catch (err) {
    handle(res, err, 'Loading the group failed. Please try again later.');
  }
}

// PATCH /communities/:id { name?, description?, privacy? } -- admins.
async function updateCommunity(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    requireAdmin(c);
    const fields = cleanFields(req.body, { partial: true });
    const keys = Object.keys(fields);
    if (keys.length === 0) throw new CommunityError(400, 'Nothing to update');
    await db.query(
      `UPDATE communities SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [c.id, ...keys.map((k) => fields[k])]
    );
    // Going public lets everyone read -- and any pending requests in.
    if (fields.privacy === 'public') {
      await db.query("UPDATE community_members SET status = 'member' WHERE community_id = $1 AND status = 'pending'", [c.id]);
    }
    res.json(await loadCommunity(c.id, req.userId));
  } catch (err) {
    handle(res, err, 'Updating the group failed. Please try again later.');
  }
}

// POST /communities/:id/join -- instant for public, a request for private.
async function joinCommunity(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    if (c.my_status) return res.json(c); // already a member / already requested
    const status = c.privacy === 'public' ? 'member' : 'pending';
    await db.query(
      "INSERT INTO community_members (community_id, user_id, role, status) VALUES ($1, $2, 'member', $3) ON CONFLICT DO NOTHING",
      [c.id, req.userId, status]
    );
    res.status(201).json(await loadCommunity(c.id, req.userId));
  } catch (err) {
    handle(res, err, 'Joining the group failed. Please try again later.');
  }
}

// DELETE /communities/:id/members/:userId -- leave (yourself, also cancels a
// pending request) or remove someone (admins).
async function removeMember(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    const targetId = Number(req.params.userId);
    if (!Number.isInteger(targetId)) throw new CommunityError(400, 'Invalid user ID');
    if (targetId !== req.userId) requireAdmin(c);
    const removed = await db.query(
      'DELETE FROM community_members WHERE community_id = $1 AND user_id = $2 RETURNING status',
      [c.id, targetId]
    );
    if (removed.rows.length === 0) throw new CommunityError(404, 'Not a member of this group');
    const outcome = removed.rows[0].status === 'member' ? await ensureAdminOrDelete(c.id) : { deleted: false };
    res.json(outcome);
  } catch (err) {
    handle(res, err, 'Updating the group failed. Please try again later.');
  }
}

// GET /communities/:id/members -- readable wherever posts are readable.
async function listMembers(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    if (!c.can_read) throw new CommunityError(403, 'Join this group to see its members');
    const result = await db.query(
      `SELECT u.id, u.username, u.avatar_url, m.role, m.joined_at
       FROM community_members m JOIN users u ON u.id = m.user_id
       WHERE m.community_id = $1 AND m.status = 'member'
       ORDER BY (m.role = 'admin') DESC, m.joined_at ASC, u.id ASC`,
      [c.id]
    );
    res.json(result.rows);
  } catch (err) {
    handle(res, err, 'Loading members failed. Please try again later.');
  }
}

// PUT /communities/:id/members/:userId/role { role } -- admins promote/demote.
async function setRole(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    requireAdmin(c);
    const role = req.body.role;
    if (!['admin', 'member'].includes(role)) throw new CommunityError(400, 'role must be admin or member');
    const updated = await db.query(
      "UPDATE community_members SET role = $3 WHERE community_id = $1 AND user_id = $2 AND status = 'member' RETURNING user_id",
      [c.id, Number(req.params.userId), role]
    );
    if (updated.rows.length === 0) throw new CommunityError(404, 'Not a member of this group');
    await ensureAdminOrDelete(c.id); // demoting the last admin re-promotes someone
    res.json({ ok: true });
  } catch (err) {
    handle(res, err, 'Changing the role failed. Please try again later.');
  }
}

// GET /communities/:id/requests -- admins.
async function listRequests(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    requireAdmin(c);
    const result = await db.query(
      `SELECT u.id, u.username, u.avatar_url, m.joined_at AS requested_at
       FROM community_members m JOIN users u ON u.id = m.user_id
       WHERE m.community_id = $1 AND m.status = 'pending'
       ORDER BY m.joined_at ASC`,
      [c.id]
    );
    res.json(result.rows);
  } catch (err) {
    handle(res, err, 'Loading requests failed. Please try again later.');
  }
}

// POST /communities/:id/requests/:userId/approve -- admins. (Deny = remove.)
async function approveRequest(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    requireAdmin(c);
    const updated = await db.query(
      "UPDATE community_members SET status = 'member', joined_at = now() WHERE community_id = $1 AND user_id = $2 AND status = 'pending' RETURNING user_id",
      [c.id, Number(req.params.userId)]
    );
    if (updated.rows.length === 0) throw new CommunityError(404, 'No pending request from that person');
    res.json({ ok: true });
  } catch (err) {
    handle(res, err, 'Approving the request failed. Please try again later.');
  }
}

// GET /communities/:id/posts -- the group's feed (public groups: anyone;
// private: members). Same per-post shape as the main feed; blocked
// authors are hidden from the viewer.
async function listPosts(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    if (!c.can_read) throw new CommunityError(403, 'This group is private. Join to see its posts.');
    const { page, limit, offset } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });
    const viewerId = req.userId ?? null;
    const result = await db.query(
      `SELECT posts.id, posts.content, posts.visibility, posts.image_url, posts.created_at, posts.community_id,
         users.id AS user_id, users.username, users.avatar_url,
         $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) AS liked_by_me,
         ${reactionColumnsSql('$1')},
         ${mediaColumnSql()},
        ${pageColumnSql()},
         (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
         $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me
       FROM posts
       JOIN users ON users.id = posts.user_id
       WHERE posts.community_id = $4
         AND NOT users.is_deactivated
         AND ($1::int IS NULL OR NOT EXISTS (
           SELECT 1 FROM blocks
           WHERE (blocks.blocker_id = $1 AND blocks.blocked_id = posts.user_id)
              OR (blocks.blocker_id = posts.user_id AND blocks.blocked_id = $1)
         ))
       ORDER BY posts.created_at DESC
       LIMIT $2 OFFSET $3`,
      [viewerId, limit + 1, offset, c.id]
    );
    const hasMore = result.rows.length > limit;
    res.json({ posts: hasMore ? result.rows.slice(0, limit) : result.rows, currentPage: page, hasMore });
  } catch (err) {
    handle(res, err, 'Loading group posts failed. Please try again later.');
  }
}

module.exports = {
  createCommunity,
  listCommunities,
  getCommunity,
  updateCommunity,
  joinCommunity,
  removeMember,
  listMembers,
  setRole,
  listRequests,
  approveRequest,
  listPosts
};
