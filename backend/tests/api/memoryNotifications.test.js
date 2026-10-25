const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const { todayIn } = require('../../utils/timeZone');

// Day 84: "You have memories" -- once a day, in each person's own morning.
describe('memories notification (Day 84)', () => {
  const { app, reset } = setupTestApp();
  const memoryNotifications = require('../../services/memoryNotificationService');
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const setZone = (user, timeZone) => request(app).put('/profile/time-zone').set(auth(user)).send({ timeZone });
  const run = () => memoryNotifications.notifyDue({ force: true });
  const sent = async (user) => (await pool.query("SELECT details FROM notifications WHERE user_id = $1 AND type = 'memories'", [user.id])).rows.map((r) => r.details);

  // Fixed-offset zones 3 hours apart: at any moment some are before 08:00
  // and some after.
  const ZONES = ['Etc/GMT+11', 'Etc/GMT+8', 'Etc/GMT+5', 'Etc/GMT+2', 'Etc/GMT-1', 'Etc/GMT-4', 'Etc/GMT-7', 'Etc/GMT-10', 'Etc/GMT-13'];
  const hourIn = (zone) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const morningZone = ZONES.find((z) => hourIn(z) >= 9 && hourIn(z) <= 22);
  const earlyZone = ZONES.find((z) => hourIn(z) < 7);

  // A profile post from noon, `years` years ago today, in `zone`.
  async function memoryIn(user, zone, years = 1, fields = {}) {
    let req = request(app).post('/posts').set(auth(user)).field('content', `from ${years} years ago`);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    const post = (await req).body;
    const [y, m, d] = todayIn(zone).split('-').map(Number);
    const local = `${y - years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} 12:00`;
    await pool.query(
      "UPDATE posts SET created_at = (($2::timestamp AT TIME ZONE $3) AT TIME ZONE current_setting('TimeZone')) WHERE id = $1",
      [post.id, local, zone]
    );
    return post;
  }

  it('tells you once, in your morning, about the most recent year', async () => {
    const me = await registerAndLogin(app);
    expect((await setZone(me, morningZone)).body).toEqual({ timeZone: morningZone });
    await memoryIn(me, morningZone, 3);
    await memoryIn(me, morningZone, 1);
    expect((await run()).people).toBe(1);
    expect(await sent(me)).toEqual([{ yearsAgo: 1 }]);
    expect((await run()).people).toBe(0); // once a day
    const [row] = (await request(app).get('/notifications').set(auth(me))).body.notifications;
    expect(row).toMatchObject({ type: 'memories', details: { yearsAgo: 1 }, actor_id: me.id });
  });

  it('waits for your morning', async () => {
    const me = await registerAndLogin(app);
    await setZone(me, earlyZone);
    await memoryIn(me, earlyZone, 2);
    expect((await run()).people).toBe(0);
    expect(await sent(me)).toEqual([]);
  });

  it('not with the setting off, an inactive account, or only group and page posts', async () => {
    const off = await registerAndLogin(app);
    await setZone(off, morningZone);
    await memoryIn(off, morningZone);
    await request(app).put('/notification-preferences').set(auth(off)).send({ memories: false });

    const away = await registerAndLogin(app);
    await setZone(away, morningZone);
    await memoryIn(away, morningZone);
    await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [away.id]);

    const busy = await registerAndLogin(app);
    await setZone(busy, morningZone);
    const group = (await request(app).post('/communities').set(auth(busy)).send({ name: 'Club' })).body;
    const page = (await request(app).post('/pages').set(auth(busy)).send({ name: 'Shop' })).body;
    await memoryIn(busy, morningZone, 1, { communityId: String(group.id) });
    await memoryIn(busy, morningZone, 1, { pageId: String(page.id) });

    expect((await run()).people).toBe(0);
    for (const user of [off, away, busy]) expect(await sent(user)).toEqual([]);
  });

  it('the setting is listed with the others', async () => {
    const me = await registerAndLogin(app);
    expect((await request(app).get('/notification-preferences').set(auth(me))).body.memories).toBe(true);
    expect((await request(app).put('/notification-preferences').set(auth(me)).send({ memories: false })).body.memories).toBe(false);
  });

  it('the time zone must be a real one', async () => {
    const me = await registerAndLogin(app);
    expect((await setZone(me, 'Mars/Olympus')).status).toBe(400);
    expect((await setZone(me, { a: 1 })).status).toBe(400);
    expect((await request(app).put('/profile/time-zone').send({ timeZone: 'UTC' })).status).toBe(401);
    expect((await setZone(me, 'Asia/Yangon')).body.timeZone).toBe('Asia/Yangon');
  });

  it('runs at most every 10 minutes per server (the cleanup forces a run)', async () => {
    const me = await registerAndLogin(app);
    await setZone(me, morningZone);
    await memoryNotifications.notifyDue({ force: true });
    await memoryIn(me, morningZone);
    expect((await memoryNotifications.notifyDue()).people).toBe(0); // too soon
    const cleanup = require('../../services/cleanupService');
    expect((await cleanup.run()).memoriesNotified).toBe(1);
  });
});
