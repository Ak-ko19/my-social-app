const { HttpError, sendError } = require('../utils/httpError');
const { noBlockBetweenSql } = require('../services/blockService');
const db = require('../db');
const { escapeLike } = require('../utils/escapeLike');
const { mediaOfCommunity, deleteMedia } = require('../services/mediaCleanupService');
const { getPagination } = require('../utils/pagination');
const { reactionColumnsSql, mediaColumnSql, pageColumnSql } = require('../services/reactionService');
const { pollColumnSql } = require('../services/pollService');
const { toUnicode } = require('../utils/myanmarText'); // Day 43: Zawgyi -> Unicode
const { isBanned } = require('../services/communityService');
const notificationService = require('../services/notificationService');

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
// - Day 50: admins can ban someone ("Remove and ban"): it removes them and
//   they can't join or ask to join again until unbanned. Only members
//   comment on and react to a group's posts (communityService).

class CommunityError extends HttpError {}

function cleanFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? toUnicode(body.name).trim() : '';
    if (!name) throw new CommunityError(400, 'A group needs a name');
    if (name.length > 100) throw new CommunityError(400, 'Group name must be 100 characters or fewer');
    out.name = name;
  }
  if (!partial || body.description !== undefined) {
    const description = typeof body.description === 'string' ? toUnicode(body.description).trim() : '';
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
    // Its posts (anyone's) cascade with it, so their images go too.
    const media = await mediaOfCommunity(communityId);
    await db.query('DELETE FROM communities WHERE id = $1', [communityId]);
    deleteMedia(media);
    return { deleted: true };
  }
  if (!members.rows.some((m) => m.role === 'admin')) {
    await db.query("UPDATE community_members SET role = 'admin' WHERE community_id = $1 AND user_id = $2", [communityId, members.rows[0].user_id]);
  }
  return { deleted: false };
}

// Day 50: "X asked to join <group>" to each admin (not one who blocked X,
// or whom X blocked).
async function notifyAdminsOfRequest(communityId, requesterId) {
  const admins = await db.query(
    `SELECT m.user_id FROM community_members m
     WHERE m.community_id = $1 AND m.role = 'admin' AND m.status = 'member'
       AND ${noBlockBetweenSql('m.user_id', '$2')}`,
    [communityId, requesterId]
  );
  for (const { user_id: adminId } of admins.rows) {
    await notificationService.notify({ userId: adminId, actorId: requesterId, type: 'group_request', communityId });
  }
}

// Once a request is handled (approved, turned down, cancelled, banned), the
// admins' notifications about it go: they'd lead to a request that's gone.
const clearRequestNotifications = (communityId, requesterId) => db.query(
  "DELETE FROM notifications WHERE community_id = $1 AND actor_id = $2 AND type = 'group_request'",
  [communityId, requesterId]
);

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
    sendError(res, err, 'Creating the group failed. Please try again later.');
  }
}

// One section of GET /communities. "mine" is the groups you're in or have
// asked to join (newest first); "discover" is the others, most members
// first. Each is its own query (Day 50: they used to be split from one
// site-wide top 100, so with enough groups your own could go missing).
async function listSection(section, userId, q, { limit, offset }) {
  const mine = section === 'mine';
  const result = await db.query(
    `SELECT c.id, c.name, c.description, c.privacy,
       (SELECT COUNT(*)::int FROM community_members m WHERE m.community_id = c.id AND m.status = 'member') AS member_count,
       me.role AS my_role, me.status AS my_status
     FROM communities c
     LEFT JOIN community_members me ON me.community_id = c.id AND me.user_id = $1
     WHERE ($2 = '' OR c.name ILIKE '%' || $2 || '%')
       AND ${mine ? 'me.user_id IS NOT NULL' : 'me.user_id IS NULL'}
     ORDER BY ${mine ? 'me.joined_at DESC, c.id DESC' : 'member_count DESC, c.id DESC'}
     LIMIT $3 OFFSET $4`,
    [userId, escapeLike(q), limit + 1, offset]
  );
  const hasMore = result.rows.length > limit;
  return { groups: hasMore ? result.rows.slice(0, limit) : result.rows, hasMore };
}

// GET /communities?q= -> { mine, mineHasMore, discover, discoverHasMore }
// (the first page of each). ?section=mine|discover&page= -> { groups,
// page, hasMore } for more of one.
async function listCommunities(req, res) {
  try {
    // Day 43: names are stored as Unicode, so a Zawgyi query is converted.
    const q = typeof req.query.q === 'string' ? toUnicode(req.query.q.trim()) : '';
    const paging = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const { section } = req.query;
    if (section !== undefined) {
      if (!['mine', 'discover'].includes(section)) throw new CommunityError(400, 'section must be mine or discover');
      const { groups, hasMore } = await listSection(section, req.userId, q, paging);
      return res.json({ groups, page: paging.page, hasMore });
    }
    const first = { limit: paging.limit, offset: 0 };
    const [mine, discover] = await Promise.all([
      listSection('mine', req.userId, q, first),
      listSection('discover', req.userId, q, first)
    ]);
    res.json({ mine: mine.groups, mineHasMore: mine.hasMore, discover: discover.groups, discoverHasMore: discover.hasMore });
  } catch (err) {
    sendError(res, err, 'Loading groups failed. Please try again later.');
  }
}

// GET /communities/:id
async function getCommunity(req, res) {
  try {
    res.json(await loadCommunity(Number(req.params.id), req.userId));
  } catch (err) {
    sendError(res, err, 'Loading the group failed. Please try again later.');
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
      await db.query("DELETE FROM notifications WHERE community_id = $1 AND type = 'group_request'", [c.id]);
    }
    res.json(await loadCommunity(c.id, req.userId));
  } catch (err) {
    sendError(res, err, 'Updating the group failed. Please try again later.');
  }
}

// DELETE /communities/:id -- admins (Day 50). The group goes for everyone,
// with its posts and their photos, and drafts written for it.
async function deleteCommunity(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    requireAdmin(c);
    const media = await mediaOfCommunity(c.id);
    await db.query('DELETE FROM communities WHERE id = $1', [c.id]);
    deleteMedia(media);
    res.json({ deleted: true });
  } catch (err) {
    sendError(res, err, 'Deleting the group failed. Please try again later.');
  }
}

// POST /communities/:id/join -- instant for public, a request for private.
async function joinCommunity(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    if (c.my_status) return res.json(c); // already a member / already requested
    if (await isBanned(c.id, req.userId)) throw new CommunityError(403, "You can't join this group");
    const status = c.privacy === 'public' ? 'member' : 'pending';
    const inserted = await db.query(
      "INSERT INTO community_members (community_id, user_id, role, status) VALUES ($1, $2, 'member', $3) ON CONFLICT DO NOTHING RETURNING user_id",
      [c.id, req.userId, status]
    );
    // Day 50: a new request tells the admins (once, even on a double click).
    if (status === 'pending' && inserted.rows.length > 0) await notifyAdminsOfRequest(c.id, req.userId);
    res.status(201).json(await loadCommunity(c.id, req.userId));
  } catch (err) {
    sendError(res, err, 'Joining the group failed. Please try again later.');
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
    // A request turned down or cancelled: its notifications go (Day 50).
    if (removed.rows[0].status === 'pending') await clearRequestNotifications(c.id, targetId);
    const outcome = removed.rows[0].status === 'member' ? await ensureAdminOrDelete(c.id) : { deleted: false };
    res.json(outcome);
  } catch (err) {
    sendError(res, err, 'Updating the group failed. Please try again later.');
  }
}

// GET /communities/:id/members -- readable wherever posts are readable.
// Admins first, then by join date; paged (Day 50): { members, page, hasMore }.
async function listMembers(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    if (!c.can_read) throw new CommunityError(403, 'Join this group to see its members');
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const result = await db.query(
      `SELECT u.id, u.username, u.avatar_url, m.role, m.joined_at
       FROM community_members m JOIN users u ON u.id = m.user_id
       WHERE m.community_id = $1 AND m.status = 'member'
       ORDER BY (m.role = 'admin') DESC, m.joined_at ASC, u.id ASC
       LIMIT $2 OFFSET $3`,
      [c.id, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    res.json({ members: hasMore ? result.rows.slice(0, limit) : result.rows, page, hasMore });
  } catch (err) {
    sendError(res, err, 'Loading members failed. Please try again later.');
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
    sendError(res, err, 'Changing the role failed. Please try again later.');
  }
}

// GET /communities/:id/requests -- admins. Oldest first; paged (Day 50):
// { requests, page, hasMore, total }.
async function listRequests(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    requireAdmin(c);
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const result = await db.query(
      `SELECT u.id, u.username, u.avatar_url, m.joined_at AS requested_at, COUNT(*) OVER ()::int AS total
       FROM community_members m JOIN users u ON u.id = m.user_id
       WHERE m.community_id = $1 AND m.status = 'pending'
       ORDER BY m.joined_at ASC, u.id ASC
       LIMIT $2 OFFSET $3`,
      [c.id, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    const rows = (hasMore ? result.rows.slice(0, limit) : result.rows).map(({ total: _total, ...r }) => r);
    // An empty page has no rows to carry the count.
    const total = result.rows[0]?.total
      ?? Number((await db.query("SELECT COUNT(*) FROM community_members WHERE community_id = $1 AND status = 'pending'", [c.id])).rows[0].count);
    res.json({ requests: rows, page, hasMore, total });
  } catch (err) {
    sendError(res, err, 'Loading requests failed. Please try again later.');
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
    // Day 50: they're told; the admins' request notifications go.
    const memberId = updated.rows[0].user_id;
    await clearRequestNotifications(c.id, memberId);
    await notificationService.notify({ userId: memberId, actorId: req.userId, type: 'group_approved', communityId: c.id });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Approving the request failed. Please try again later.');
  }
}

// POST /communities/:id/bans/:userId -- admins: "Remove and ban". Takes a
// member out (or turns down their request) and stops them joining or
// asking again. An admin must be made a member first; nobody bans
// themselves. Banning twice is harmless.
async function banMember(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    requireAdmin(c);
    const targetId = Number(req.params.userId);
    if (!Number.isInteger(targetId)) throw new CommunityError(400, 'Invalid user ID');
    if (targetId === req.userId) throw new CommunityError(400, "You can't ban yourself");
    const target = await db.query(
      `SELECT u.id, m.role, m.status FROM users u
       LEFT JOIN community_members m ON m.community_id = $1 AND m.user_id = u.id
       WHERE u.id = $2`,
      [c.id, targetId]
    );
    if (target.rows.length === 0) throw new CommunityError(404, 'User not found');
    if (target.rows[0].role === 'admin' && target.rows[0].status === 'member') {
      throw new CommunityError(400, 'Make this admin a member before banning them');
    }
    // One statement: never removed without the ban, or banned while still in.
    await db.query(
      `WITH removed AS (DELETE FROM community_members WHERE community_id = $1 AND user_id = $2)
       INSERT INTO community_bans (community_id, user_id, banned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [c.id, targetId, req.userId]
    );
    await clearRequestNotifications(c.id, targetId);
    res.status(201).json({ banned: true });
  } catch (err) {
    sendError(res, err, 'Updating the group failed. Please try again later.');
  }
}

// DELETE /communities/:id/bans/:userId -- admins. They may join (or ask) again.
async function unbanMember(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    requireAdmin(c);
    const targetId = Number(req.params.userId);
    if (!Number.isInteger(targetId)) throw new CommunityError(400, 'Invalid user ID');
    await db.query('DELETE FROM community_bans WHERE community_id = $1 AND user_id = $2', [c.id, targetId]);
    res.json({ banned: false });
  } catch (err) {
    sendError(res, err, 'Updating the group failed. Please try again later.');
  }
}

// GET /communities/:id/bans -- admins; newest first, paged.
async function listBans(req, res) {
  try {
    const c = await loadCommunity(Number(req.params.id), req.userId);
    requireAdmin(c);
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const result = await db.query(
      `SELECT u.id, u.username, u.avatar_url, b.created_at AS banned_at
       FROM community_bans b JOIN users u ON u.id = b.user_id
       WHERE b.community_id = $1
       ORDER BY b.created_at DESC, u.id DESC
       LIMIT $2 OFFSET $3`,
      [c.id, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    res.json({ bans: hasMore ? result.rows.slice(0, limit) : result.rows, page, hasMore });
  } catch (err) {
    sendError(res, err, 'Loading banned people failed. Please try again later.');
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
         ${pollColumnSql('$1')},
        ${pageColumnSql()},
         (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = posts.id) AS like_count,
         $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks WHERE bookmarks.post_id = posts.id AND bookmarks.user_id = $1) AS bookmarked_by_me
       FROM posts
       JOIN users ON users.id = posts.user_id
       WHERE posts.community_id = $4
         AND NOT users.is_deactivated
         AND ($1::int IS NULL OR ${noBlockBetweenSql('$1', 'posts.user_id')})
       ORDER BY posts.created_at DESC
       LIMIT $2 OFFSET $3`,
      [viewerId, limit + 1, offset, c.id]
    );
    const hasMore = result.rows.length > limit;
    res.json({ posts: hasMore ? result.rows.slice(0, limit) : result.rows, currentPage: page, hasMore });
  } catch (err) {
    sendError(res, err, 'Loading group posts failed. Please try again later.');
  }
}

module.exports = {
  createCommunity,
  listCommunities,
  getCommunity,
  updateCommunity,
  deleteCommunity,
  joinCommunity,
  removeMember,
  listMembers,
  setRole,
  listRequests,
  approveRequest,
  listPosts,
  banMember,
  unbanMember,
  listBans
};
