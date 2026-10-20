const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B10 group chat (migration 023).
describe('group chat (B10)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  let owner;
  let m1;
  let m2;

  const createGroup = (user, name, userIds) =>
    request(app).post('/conversations/groups').set(auth(user)).send({ name, userIds });
  const details = (user, id) => request(app).get(`/conversations/${id}`).set(auth(user));
  const say = (user, id, content) => request(app).post(`/conversations/${id}/messages`).set(auth(user)).send({ content });

  beforeEach(async () => {
    owner = await registerAndLogin(app);
    m1 = await registerAndLogin(app);
    m2 = await registerAndLogin(app);
  });

  describe('create', () => {
    it('creates a named group; creator is admin, others members', async () => {
      const res = await createGroup(owner, '  Trip planning  ', [m1.id, m2.id]);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type: 'group', name: 'Trip planning', my_role: 'admin' });
      const roles = Object.fromEntries(res.body.members.map((m) => [m.id, m.role]));
      expect(roles).toEqual({ [owner.id]: 'admin', [m1.id]: 'member', [m2.id]: 'member' });
    });

    it('validation: name required, someone else required, unknown / blocked / deactivated users refused', async () => {
      expect((await createGroup(owner, '   ', [m1.id])).status).toBe(400);
      expect((await createGroup(owner, 'x'.repeat(101), [m1.id])).status).toBe(400);
      expect((await createGroup(owner, 'Solo', [owner.id])).status).toBe(400);
      expect((await createGroup(owner, 'Ghost', [999999])).status).toBe(400);

      await request(app).post(`/users/${owner.id}/block`).set(auth(m2));
      expect((await createGroup(owner, 'Blocked', [m1.id, m2.id])).status).toBe(400);

      const gone = await registerAndLogin(app);
      await request(app).post('/profile/deactivate').set(auth(gone)).send({ password: gone.password });
      expect((await createGroup(owner, 'Gone', [m1.id, gone.id])).status).toBe(400);
    });

    it('caps a group at 50 members (creator + 49), on create and on add', async () => {
      // 50 real, valid users (inserted directly -- 50 signups would mean 50
      // bcrypt hashes), so it's the CAP that rejects, not user validation.
      const { pool } = require('../helpers/testDb');
      const inserted = await pool.query(
        `INSERT INTO users (username, email, password)
         SELECT 'bulk' || g || '_' || $1, 'bulk' || g || '_' || $1 || '@example.com', 'x'
         FROM generate_series(1, 50) AS g RETURNING id`,
        [Date.now()]
      );
      const ids = inserted.rows.map((r) => r.id);

      const tooBig = await createGroup(owner, 'Huge', ids); // 1 + 50
      expect(tooBig.status).toBe(400);
      expect(tooBig.text).toMatch(/at most 50/);

      const full = await createGroup(owner, 'Full', ids.slice(0, 49)); // exactly 50
      expect(full.status).toBe(201);
      const add = await request(app).post(`/conversations/${full.body.id}/members`).set(auth(owner)).send({ userIds: [m1.id] });
      expect(add.status).toBe(400);
    });
  });

  describe('messaging', () => {
    it('every member can send and read; non-members cannot', async () => {
      const g = (await createGroup(owner, 'Crew', [m1.id, m2.id])).body;
      expect((await say(m1, g.id, 'hi all')).status).toBe(201);
      expect((await say(m2, g.id, 'hey')).status).toBe(201);
      const history = await request(app).get(`/conversations/${g.id}/messages`).set(auth(owner));
      expect(history.body.messages.map((m) => m.content)).toEqual(['hi all', 'hey']);

      const outsider = await registerAndLogin(app);
      expect((await say(outsider, g.id, 'let me in')).status).toBe(403);
      expect((await request(app).get(`/conversations/${g.id}/messages`).set(auth(outsider))).status).toBe(403);
      expect((await details(outsider, g.id)).status).toBe(403);
    });

    it('a block between two members does not silence the group', async () => {
      const g = (await createGroup(owner, 'Crew', [m1.id, m2.id])).body;
      await request(app).post(`/users/${m2.id}/block`).set(auth(m1));
      expect((await say(m1, g.id, 'still here')).status).toBe(201);
      expect((await say(m2, g.id, 'me too')).status).toBe(201);
    });

    it('group messages get no misleading read ticks; unread counts are per member', async () => {
      const g = (await createGroup(owner, 'Crew', [m1.id, m2.id])).body;
      await say(owner, g.id, 'one');
      await say(owner, g.id, 'two');
      await request(app).put(`/conversations/${g.id}/read`).set(auth(m1));

      const history = await request(app).get(`/conversations/${g.id}/messages`).set(auth(owner));
      expect(history.body.messages.every((m) => m.status === 'sent')).toBe(true);

      const inboxM1 = (await request(app).get('/conversations').set(auth(m1))).body.conversations.find((c) => c.conversation_id === g.id);
      const inboxM2 = (await request(app).get('/conversations').set(auth(m2))).body.conversations.find((c) => c.conversation_id === g.id);
      expect(inboxM1.unread_count).toBe(0);
      expect(inboxM2.unread_count).toBe(2);
    });

    it('inbox lists groups with name, member count and a sender-prefixed preview', async () => {
      const g = (await createGroup(owner, 'Crew', [m1.id, m2.id])).body;
      await say(m1, g.id, 'lunch?');
      const row = (await request(app).get('/conversations').set(auth(m2))).body.conversations.find((c) => c.conversation_id === g.id);
      expect(row).toMatchObject({ type: 'group', name: 'Crew', username: 'Crew', member_count: 3, last_message: `${m1.username}: lunch?` });
      const own = (await request(app).get('/conversations').set(auth(m1))).body.conversations.find((c) => c.conversation_id === g.id);
      expect(own.last_message).toBe('You: lunch?');
    });
  });

  describe('membership', () => {
    it('admins add people; members cannot; duplicates are ignored', async () => {
      const g = (await createGroup(owner, 'Crew', [m1.id])).body;
      expect((await request(app).post(`/conversations/${g.id}/members`).set(auth(m1)).send({ userIds: [m2.id] })).status).toBe(403);
      const add = await request(app).post(`/conversations/${g.id}/members`).set(auth(owner)).send({ userIds: [m2.id, m1.id] });
      expect(add.status).toBe(200);
      expect(add.body.added).toEqual([m2.id]);
      expect(add.body.members).toHaveLength(3);
      expect((await say(m2, g.id, 'thanks for adding me')).status).toBe(201);
    });

    it('admins remove people; members cannot remove others; removed people lose access', async () => {
      const g = (await createGroup(owner, 'Crew', [m1.id, m2.id])).body;
      expect((await request(app).delete(`/conversations/${g.id}/members/${m2.id}`).set(auth(m1))).status).toBe(403);
      expect((await request(app).delete(`/conversations/${g.id}/members/${m2.id}`).set(auth(owner))).status).toBe(200);
      expect((await say(m2, g.id, 'hello?')).status).toBe(403);
      // Already removed -> 404 (not a member any more).
      expect((await request(app).delete(`/conversations/${g.id}/members/${m2.id}`).set(auth(owner))).status).toBe(404);
    });

    it('anyone can leave; the last admin leaving promotes the longest-standing member', async () => {
      const g = (await createGroup(owner, 'Crew', [m1.id, m2.id])).body;
      const leave = await request(app).delete(`/conversations/${g.id}/members/${owner.id}`).set(auth(owner));
      expect(leave.status).toBe(200);
      const roles = Object.fromEntries(leave.body.members.map((m) => [m.id, m.role]));
      // m1 and m2 joined together; ties break by lowest user id (m1).
      expect(roles).toEqual({ [m1.id]: 'admin', [m2.id]: 'member' });
      expect((await details(owner, g.id)).status).toBe(403);
    });

    it('the group is deleted when its last member leaves', async () => {
      const g = (await createGroup(owner, 'Pair', [m1.id])).body;
      await request(app).delete(`/conversations/${g.id}/members/${m1.id}`).set(auth(m1));
      const last = await request(app).delete(`/conversations/${g.id}/members/${owner.id}`).set(auth(owner));
      expect(last.body.deleted).toBe(true);
      const { pool } = require('../helpers/testDb');
      expect((await pool.query('SELECT 1 FROM conversations WHERE id = $1', [g.id])).rows).toHaveLength(0);
    });

    it('renaming: admins only, name validated', async () => {
      const g = (await createGroup(owner, 'Crew', [m1.id])).body;
      expect((await request(app).patch(`/conversations/${g.id}`).set(auth(m1)).send({ name: 'Mine now' })).status).toBe(403);
      expect((await request(app).patch(`/conversations/${g.id}`).set(auth(owner)).send({ name: '' })).status).toBe(400);
      const ok = await request(app).patch(`/conversations/${g.id}`).set(auth(owner)).send({ name: 'Weekend crew' });
      expect(ok.body.name).toBe('Weekend crew');
      expect((await details(m1, g.id)).body.name).toBe('Weekend crew');
    });

    it('group endpoints refuse direct conversations', async () => {
      const direct = (await request(app).post('/conversations').set(auth(owner)).send({ userId: m1.id })).body;
      expect((await request(app).post(`/conversations/${direct.id}/members`).set(auth(owner)).send({ userIds: [m2.id] })).status).toBe(400);
      const d = await details(owner, direct.id);
      expect(d.status).toBe(200);
      expect(d.body.type).toBe('direct');
      expect(d.body.members).toHaveLength(2);
    });
  });
});
