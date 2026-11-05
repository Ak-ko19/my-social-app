const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const { todayIn } = require('../../utils/timeZone');

// Day 111: "Today is Ann's birthday" to Ann's friends, in each friend's own
// morning, once.
describe('birthday notifications (Day 111)', () => {
  const { app, reset } = setupTestApp();
  const birthdays = require('../../services/birthdayNotificationService');
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const setZone = (user, timeZone) => request(app).put('/profile/time-zone').set(auth(user)).send({ timeZone });
  const run = () => birthdays.notifyDue({ force: true });
  const told = async (user) => (await pool.query("SELECT actor_id FROM notifications WHERE user_id = $1 AND type = 'birthday' ORDER BY id", [user.id])).rows.map((r) => r.actor_id);
  const friends = async (a, b) => {
    await request(app).post(`/users/${b.id}/follow`).set(auth(a));
    await request(app).post(`/users/${a.id}/follow`).set(auth(b));
  };

  // Fixed-offset zones 3 hours apart: at any moment some are before 08:00
  // and some after.
  const ZONES = ['Etc/GMT+11', 'Etc/GMT+8', 'Etc/GMT+5', 'Etc/GMT+2', 'Etc/GMT-1', 'Etc/GMT-4', 'Etc/GMT-7', 'Etc/GMT-10', 'Etc/GMT-13'];
  const hourIn = (zone) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const morningZone = ZONES.find((z) => hourIn(z) >= 9 && hourIn(z) <= 22);
  const earlyZone = ZONES.find((z) => hourIn(z) < 7);
  // Ann's birthday is today where `zone` is.
  const bornToday = (user, zone, audience = 'friends') => {
    const [, m, d] = todayIn(zone).split('-').map(Number);
    return request(app).put('/profile/birthday').set(auth(user)).send({ month: m, day: d, audience });
  };

  let ann;
  let bea;
  beforeEach(async () => {
    ann = await registerAndLogin(app);
    bea = await registerAndLogin(app);
    await friends(ann, bea);
    await setZone(bea, morningZone);
  });

  it("tells each friend once, in the friend's morning, about the friend having the birthday; the notification and the push name her", async () => {
    await bornToday(ann, morningZone);
    expect((await run()).people).toBe(1);
    expect(await told(bea)).toEqual([ann.id]);
    expect(await told(ann)).toEqual([]);
    expect((await run()).people).toBe(0);
    expect(await told(bea)).toEqual([ann.id]);
    const shown = (await request(app).get('/notifications').set(auth(bea))).body.notifications[0];
    expect(shown).toMatchObject({ type: 'birthday', actor_id: ann.id, actor_username: ann.username });
  });

  it("not before 08:00 where the friend is; not for someone who isn't a friend (one-way follow)", async () => {
    await bornToday(ann, earlyZone);
    await setZone(bea, earlyZone);
    expect((await run()).people).toBe(0);
    const cal = await registerAndLogin(app);
    await request(app).post(`/users/${ann.id}/follow`).set(auth(cal));
    await setZone(cal, morningZone);
    await bornToday(ann, morningZone, 'public');
    expect((await run()).people).toBe(0);
    expect(await told(cal)).toEqual([]);
    // ...nor someone she follows who doesn't follow her back.
    const dee = await registerAndLogin(app);
    await request(app).post(`/users/${dee.id}/follow`).set(auth(ann));
    await setZone(dee, morningZone);
    expect((await run()).people).toBe(0);
    expect(await told(dee)).toEqual([]);
  });

  it('nobody is told when she shows it to only herself, or across a block, a restriction, a turned-off setting or a gone account', async () => {
    await bornToday(ann, morningZone, 'only_me');
    expect((await run()).people).toBe(0);
    await bornToday(ann, morningZone, 'friends');

    await request(app).post(`/users/${ann.id}/restrict`).set(auth(bea));
    expect((await run()).people).toBe(0);
    await request(app).delete(`/users/${ann.id}/restrict`).set(auth(bea));

    await request(app).put('/notification-preferences').set(auth(bea)).send({ birthdays: false });
    expect((await run()).people).toBe(0);
    await request(app).put('/notification-preferences').set(auth(bea)).send({ birthdays: true });

    await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [ann.id]);
    expect((await run()).people).toBe(0);
    await pool.query('UPDATE users SET is_deactivated = false WHERE id = $1', [ann.id]);

    // A block ends the friendship too; restore the follows to test the block alone.
    await pool.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [bea.id, ann.id]);
    expect((await run()).people).toBe(0);
    await pool.query('DELETE FROM blocks');
    expect((await run()).people).toBe(1);
  });

  it('29 February is on the 28th in a year without one, and on the 29th in a leap year', async () => {
    const on = async (m, d, here) => (await pool.query(`SELECT ${birthdays.onBirthdaySql('$1::int', '$2::int', '$3::timestamp')} AS ok`, [m, d, here])).rows[0].ok;
    expect(await on(2, 29, '2027-02-28 09:00')).toBe(true);
    expect(await on(2, 29, '2028-02-28 09:00')).toBe(false);
    expect(await on(2, 29, '2028-02-29 09:00')).toBe(true);
    expect(await on(2, 28, '2027-02-28 09:00')).toBe(true);
    expect(await on(3, 1, '2027-02-28 09:00')).toBe(false);
  });

  it('the daily cleanup sends them too (a backstop for the ticker)', async () => {
    await bornToday(ann, morningZone);
    const cleanup = require('../../services/cleanupService');
    expect((await cleanup.run()).birthdaysNotified).toBe(1);
  });
});
