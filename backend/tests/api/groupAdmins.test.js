const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 33: group admins can make others admins, or remove that role (their
// own too) -- but a group always keeps at least one admin.
describe('group admins (Day 33)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const setRole = (actor, groupId, target, role) =>
    request(app).patch(`/conversations/${groupId}/members/${target.id}`).set(auth(actor)).send({ role });
  const roles = async (user, groupId) => Object.fromEntries(
    (await request(app).get(`/conversations/${groupId}`).set(auth(user))).body.members.map((m) => [m.id, m.role])
  );

  let owner;
  let ann;
  let ben;
  let group;
  beforeEach(async () => {
    owner = await registerAndLogin(app);
    ann = await registerAndLogin(app);
    ben = await registerAndLogin(app);
    group = (await request(app).post('/conversations/groups').set(auth(owner)).send({ name: 'Trip', userIds: [ann.id, ben.id] })).body;
  });

  it('an admin makes a member an admin, and that admin can then manage the group', async () => {
    const res = await setRole(owner, group.id, ann, 'admin');
    expect(res.status).toBe(200);
    expect(res.body.members.find((m) => m.id === ann.id).role).toBe('admin');
    expect((await request(app).patch(`/conversations/${group.id}`).set(auth(ann)).send({ name: 'Trip 2' })).status).toBe(200);
  });

  it('an admin removes another admin\'s role, or steps down when another admin exists', async () => {
    await setRole(owner, group.id, ann, 'admin');
    expect((await setRole(ann, group.id, owner, 'member')).status).toBe(200);
    expect(await roles(ann, group.id)).toMatchObject({ [owner.id]: 'member', [ann.id]: 'admin' });
    await setRole(ann, group.id, ben, 'admin');
    expect((await setRole(ann, group.id, ann, 'member')).status).toBe(200); // step down
    expect(await roles(ben, group.id)).toMatchObject({ [ann.id]: 'member', [ben.id]: 'admin' });
  });

  it('never leaves a group without an admin (409)', async () => {
    const res = await setRole(owner, group.id, owner, 'member');
    expect(res.status).toBe(409);
    expect(res.text).toBe('A group needs at least one admin');
    expect((await roles(owner, group.id))[owner.id]).toBe('admin');
  });

  it('two admins removing each other at the same moment still leave one admin', async () => {
    await setRole(owner, group.id, ann, 'admin');
    const results = await Promise.all([setRole(owner, group.id, ann, 'member'), setRole(ann, group.id, owner, 'member')]);
    const statuses = results.map((r) => r.status).sort();
    const now = await roles(ben, group.id);
    const admins = [owner.id, ann.id].filter((id) => now[id] === 'admin');
    expect(admins).toHaveLength(1);
    // One went through; the other was refused (409) or found the actor no
    // longer an admin (403).
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
  });

  // Deterministic version of the race above: one demotion is held open in a
  // transaction; the other must wait for it, then see that it would leave
  // no admin, and change nothing.
  it('the role change locks the group: a concurrent demotion waits and then refuses', async () => {
    await setRole(owner, group.id, ann, 'admin');
    const { SET_ROLE_SQL } = require('../../controllers/groupController');
    const { pool } = require('../helpers/testDb');
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('BEGIN');
      await first.query(SET_ROLE_SQL, [group.id, ann.id, 'member']);
      let secondDone = false;
      const pending = second.query(SET_ROLE_SQL, [group.id, owner.id, 'member']).then((r) => { secondDone = true; return r; });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(secondDone).toBe(false); // blocked on the lock
      await first.query('COMMIT');
      expect((await pending).rowCount).toBe(0);
    } finally {
      // If an expectation failed mid-way, don't hand an open transaction
      // back to the pool (it would break every later test).
      await first.query('ROLLBACK').catch(() => {});
      first.release();
      second.release();
    }
    expect(await roles(ben, group.id)).toMatchObject({ [owner.id]: 'admin', [ann.id]: 'member' });
  });

  it('only admins (403), only people in the group (404), only real roles (400)', async () => {
    expect((await setRole(ann, group.id, ben, 'admin')).status).toBe(403);
    const outsider = await registerAndLogin(app);
    expect((await setRole(owner, group.id, outsider, 'admin')).status).toBe(404);
    expect((await setRole(outsider, group.id, ann, 'admin')).status).toBe(403);
    expect((await setRole(owner, group.id, ann, 'owner')).status).toBe(400);
    expect((await request(app).patch(`/conversations/${group.id}/members/abc`).set(auth(owner)).send({ role: 'admin' })).status).toBe(400);
  });

  it('not for direct chats', async () => {
    const direct = (await request(app).post('/conversations').set(auth(owner)).send({ userId: ann.id })).body;
    expect((await setRole(owner, direct.id, ann, 'admin')).status).toBe(400);
  });
});
