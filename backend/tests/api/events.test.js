const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 55 step 1: events (migration 065).
describe('events (Day 55)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const HOUR = 60 * 60 * 1000;
  const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString();
  const create = (user, body) => request(app).post('/events').set(auth(user)).send({ name: 'Picnic', startsAt: inHours(48), ...body });
  const get = (user, id) => request(app).get(`/events/${id}`).set(user ? auth(user) : {});
  const answer = (user, id, status) => request(app).put(`/events/${id}/response`).set(auth(user)).send({ status });
  const list = async (user, query = '') => (await request(app).get(`/events${query}`).set(auth(user))).body;
  // Straight into the table: times create can't (the past).
  const move = (id, startsHoursAgo, endsHoursAgo = null) => pool.query(
    'UPDATE events SET starts_at = now() - make_interval(hours => $2), ends_at = CASE WHEN $3::int IS NULL THEN NULL ELSE now() - make_interval(hours => $3::int) END WHERE id = $1',
    [id, startsHoursAgo, endsHoursAgo]
  );

  let host;
  let guest;
  let other;
  beforeEach(async () => {
    host = await registerAndLogin(app);
    guest = await registerAndLogin(app);
    other = await registerAndLogin(app);
  });

  it('creates an event; anyone (even logged out) sees a public one', async () => {
    const res = await create(host, { name: '  Beach clean-up ', location: 'North pier', description: 'Bring gloves', endsAt: inHours(50) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Beach clean-up', location: 'North pier', description: 'Bring gloves', audience: 'public',
      host_id: host.id, is_host: true, going_count: 0, interested_count: 0, my_response: null, has_ended: false, cancelled_at: null
    });
    expect((await get(null, res.body.id)).body).toMatchObject({ name: 'Beach clean-up', is_host: false });
    expect((await get(guest, 'x')).status).toBe(400);
    expect((await get(guest, 99999)).status).toBe(404);
  });

  it('checks the fields', async () => {
    const bad = async (body) => (await create(host, body)).text;
    expect(await bad({ name: '  ' })).toBe('An event needs a name');
    expect(await bad({ name: 'x'.repeat(101) })).toBe('Event name must be 100 characters or fewer');
    expect(await bad({ startsAt: 'soon' })).toBe('Enter a valid date and time');
    expect(await bad({ startsAt: undefined })).toBe('Choose when the event starts');
    expect(await bad({ endsAt: 'later' })).toBe('Enter a valid date and time');
    expect(await bad({ startsAt: inHours(-1) })).toBe('The event must start in the future');
    expect(await bad({ startsAt: inHours(24 * 400) })).toBe('The event must start within a year');
    expect(await bad({ endsAt: inHours(47) })).toBe('The event must end after it starts');
    expect(await bad({ endsAt: inHours(48 + 24 * 32) })).toBe('An event can last at most 31 days');
    expect(await bad({ location: 'x'.repeat(201) })).toBe('Location must be 200 characters or fewer');
    expect(await bad({ description: 'x'.repeat(2001) })).toBe('Details must be 2000 characters or fewer');
    expect((await create(host, { audience: 'friends' })).status).toBe(400);
    expect((await request(app).post('/events').send({ name: 'x', startsAt: inHours(2) })).status).toBe(401);
  });

  it('followers-only: the host and accepted followers; a block or a deactivated host hides it', async () => {
    const event = (await create(host, { audience: 'followers' })).body;
    expect((await get(guest, event.id)).status).toBe(404);
    expect((await get(null, event.id)).status).toBe(404);
    await request(app).post(`/users/${host.id}/follow`).set(auth(guest));
    expect((await get(guest, event.id)).status).toBe(200);
    const open = (await create(host)).body;
    await request(app).post(`/users/${other.id}/block`).set(auth(host));
    expect((await get(other, open.id)).status).toBe(404);
    await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [host.id]);
    expect((await get(guest, event.id)).status).toBe(404);
  });

  it('going / interested: counted, changeable, taken back; not by the host', async () => {
    const event = (await create(host)).body;
    expect((await answer(guest, event.id, 'interested')).body).toMatchObject({ my_response: 'interested', interested_count: 1, going_count: 0 });
    expect((await answer(guest, event.id, 'going')).body).toMatchObject({ my_response: 'going', interested_count: 0, going_count: 1 });
    await answer(other, event.id, 'going');
    expect((await get(host, event.id)).body.going_count).toBe(2);
    expect((await answer(guest, event.id, 'maybe')).status).toBe(400);
    expect((await answer(host, event.id, 'going')).text).toBe("You're hosting this event");
    expect((await request(app).delete(`/events/${event.id}/response`).set(auth(guest))).body).toMatchObject({ my_response: null, going_count: 1 });
  });

  it('guests by answer, newest first, paged, without anyone across a block', async () => {
    const event = (await create(host)).body;
    await answer(guest, event.id, 'going');
    await answer(other, event.id, 'going');
    const extra = await registerAndLogin(app);
    await answer(extra, event.id, 'interested');
    const going = (await request(app).get(`/events/${event.id}/guests?status=going&limit=1`).set(auth(host))).body;
    expect(going).toEqual({ guests: [expect.objectContaining({ id: other.id })], page: 1, hasMore: true });
    const interested = (await request(app).get(`/events/${event.id}/guests?status=interested`)).body;
    expect(interested.guests.map((g) => g.id)).toEqual([extra.id]);
    await request(app).post(`/users/${other.id}/block`).set(auth(guest));
    const seenByGuest = (await request(app).get(`/events/${event.id}/guests`).set(auth(guest))).body;
    expect(seenByGuest.guests.map((g) => g.id)).toEqual([guest.id]);
    expect((await request(app).get(`/events/${event.id}/guests?status=no`).set(auth(host))).status).toBe(400);
  });

  it('the host edits (a new start re-arms the reminder), cancels and deletes; nobody else can', async () => {
    const event = (await create(host)).body;
    await pool.query('UPDATE events SET reminder_sent_at = now() WHERE id = $1', [event.id]);
    expect((await request(app).patch(`/events/${event.id}`).set(auth(guest)).send({ name: 'Mine now' })).status).toBe(403);
    const edited = await request(app).patch(`/events/${event.id}`).set(auth(host)).send({ name: 'Picnic 2', startsAt: inHours(72) });
    expect(edited.body.name).toBe('Picnic 2');
    expect((await pool.query('SELECT reminder_sent_at FROM events WHERE id = $1', [event.id])).rows[0].reminder_sent_at).toBeNull();
    expect((await request(app).patch(`/events/${event.id}`).set(auth(host)).send({})).text).toBe('Nothing to update');
    expect((await request(app).patch(`/events/${event.id}`).set(auth(host)).send({ endsAt: inHours(10) })).text).toBe('The event must end after it starts');
    expect((await request(app).post(`/events/${event.id}/cancel`).set(auth(guest))).status).toBe(403);
    const cancelled = (await request(app).post(`/events/${event.id}/cancel`).set(auth(host))).body;
    expect(cancelled.cancelled_at).not.toBeNull();
    expect((await answer(guest, event.id, 'going')).text).toBe('This event was cancelled');
    expect((await request(app).patch(`/events/${event.id}`).set(auth(host)).send({ name: 'x' })).text).toBe('This event was cancelled');
    expect((await request(app).delete(`/events/${event.id}`).set(auth(guest))).status).toBe(403);
    expect((await request(app).delete(`/events/${event.id}`).set(auth(host))).body).toEqual({ deleted: true });
    expect((await get(host, event.id)).status).toBe(404);
  });

  it('a follow request that is still pending doesn\'t count as following', async () => {
    await pool.query('UPDATE users SET is_private = true WHERE id = $1', [host.id]);
    const event = (await create(host, { audience: 'followers' })).body;
    await request(app).post(`/users/${host.id}/follow`).set(auth(guest)); // a request: private account
    expect((await pool.query('SELECT status FROM follows WHERE follower_id = $1', [guest.id])).rows[0].status).toBe('pending');
    expect((await get(guest, event.id)).status).toBe(404);
  });

  it('an event in progress (started, not over) still takes answers and stays listed', async () => {
    const event = (await create(host, { name: 'Festival' })).body;
    await pool.query("UPDATE events SET starts_at = now() - interval '1 hour', ends_at = now() + interval '2 hours' WHERE id = $1", [event.id]);
    expect((await answer(guest, event.id, 'going')).body).toMatchObject({ has_ended: false, my_response: 'going' });
    expect((await list(guest)).events.map((e) => e.name)).toEqual(['Festival']);
  });

  it('a finished event: no more answers, no edits; still viewable', async () => {
    const event = (await create(host)).body;
    await move(event.id, 5, 2);
    expect((await get(guest, event.id)).body.has_ended).toBe(true);
    expect((await answer(guest, event.id, 'going')).text).toBe('This event has ended');
    expect((await request(app).patch(`/events/${event.id}`).set(auth(host)).send({ name: 'x' })).text).toBe('This event has ended');
    expect((await request(app).post(`/events/${event.id}/cancel`).set(auth(host))).text).toBe('This event has ended');
  });

  it('lists: yours (hosting or answered) and discover (the rest), upcoming soonest first, paged', async () => {
    const later = (await create(host, { name: 'Later', startsAt: inHours(72) })).body;
    await create(host, { name: 'Sooner', startsAt: inHours(24) });
    await create(other, { name: 'Theirs' });
    const gone = (await create(other, { name: 'Gone' })).body;
    await request(app).post(`/events/${gone.id}/cancel`).set(auth(other));
    const past = (await create(other, { name: 'Past' })).body;
    await move(past.id, 3);
    await create(other, { name: 'Followers only', audience: 'followers' });
    await answer(guest, later.id, 'interested');

    expect((await list(host)).events.map((e) => e.name)).toEqual(['Sooner', 'Later']);
    expect((await list(guest)).events.map((e) => e.name)).toEqual(['Later']);
    expect((await list(guest, '?section=discover')).events.map((e) => e.name)).toEqual(['Sooner', 'Theirs']);
    expect((await list(other)).events.map((e) => e.name)).toEqual(['Theirs', 'Gone', 'Followers only']);
    const paged = await list(host, '?section=mine&limit=1&page=2');
    expect(paged).toEqual({ events: [expect.objectContaining({ id: later.id })], page: 2, hasMore: false });
    expect((await request(app).get('/events?section=all').set(auth(host))).status).toBe(400);
  });

  // Day 55 step 3: reminders and the cancel notification.
  describe('notifications', () => {
    const reminders = () => require('../../services/eventNotificationService');
    const inbox = async (user) => (await request(app).get('/notifications').set(auth(user))).body.notifications
      .map((n) => ({ type: n.type, from: n.actor_username, event: n.event_name }));
    // Starts in `minutes` (straight into the table: create wants the future
    // and keeps it there).
    const startsIn = (id, minutes) => pool.query('UPDATE events SET starts_at = now() + make_interval(mins => $2) WHERE id = $1', [id, minutes]);

    it('an hour before: everyone going or interested who can still see it; once', async () => {
      const event = (await create(host, { name: 'Picnic' })).body;
      await answer(guest, event.id, 'going');
      await answer(other, event.id, 'interested');
      const blocked = await registerAndLogin(app);
      await answer(blocked, event.id, 'going');
      await request(app).post(`/users/${blocked.id}/block`).set(auth(host));
      const gone = await registerAndLogin(app);
      await answer(gone, event.id, 'interested');
      await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [gone.id]);
      expect(await reminders().remindDue()).toEqual({ events: 0, people: 0 }); // two days away
      await startsIn(event.id, 30);
      expect(await reminders().remindDue()).toEqual({ events: 1, people: 2 });
      expect(await inbox(guest)).toEqual([{ type: 'event_reminder', from: host.username, event: 'Picnic' }]);
      expect(await inbox(other)).toEqual([{ type: 'event_reminder', from: host.username, event: 'Picnic' }]);
      expect(await inbox(blocked)).toEqual([]);
      expect(await inbox(host)).toEqual([]);
      expect(await reminders().remindDue()).toEqual({ events: 0, people: 0 });
    });

    it('a new start time re-arms it; slept past the start: marked, no late reminder', async () => {
      const event = (await create(host)).body;
      await answer(guest, event.id, 'going');
      await startsIn(event.id, 30);
      await reminders().remindDue();
      await request(app).patch(`/events/${event.id}`).set(auth(host)).send({ startsAt: inHours(30) });
      await startsIn(event.id, 20);
      expect((await reminders().remindDue()).people).toBe(1);
      expect((await inbox(guest)).filter((n) => n.type === 'event_reminder')).toHaveLength(2);
      const late = (await create(host, { name: 'Late' })).body;
      await answer(guest, late.id, 'going');
      await startsIn(late.id, -10);
      expect(await reminders().remindDue()).toEqual({ events: 1, people: 0 });
      expect((await pool.query('SELECT reminder_sent_at IS NOT NULL AS sent FROM events WHERE id = $1', [late.id])).rows[0].sent).toBe(true);
    });

    it('not for a cancelled event, nor a followers-only one they can no longer see, nor with Events off', async () => {
      const cancelled = (await create(host, { name: 'Off' })).body;
      await answer(guest, cancelled.id, 'going');
      await request(app).post(`/events/${cancelled.id}/cancel`).set(auth(host));
      await startsIn(cancelled.id, 30);
      const forFollowers = (await create(host, { name: 'Close', audience: 'followers' })).body;
      await request(app).post(`/users/${host.id}/follow`).set(auth(other));
      await answer(other, forFollowers.id, 'going');
      await request(app).delete(`/users/${host.id}/follow`).set(auth(other)); // no longer a follower
      await startsIn(forFollowers.id, 30);
      const quiet = (await create(host, { name: 'Quiet' })).body;
      const muted = await registerAndLogin(app);
      await answer(muted, quiet.id, 'going');
      await request(app).put('/notification-preferences').set(auth(muted)).send({ events: false });
      await startsIn(quiet.id, 30);
      await pool.query('DELETE FROM notifications');
      expect(await reminders().remindDue()).toEqual({ events: 2, people: 1 }); // "Close" has nobody left; "Quiet" one, switched off
      expect(await inbox(guest)).toEqual([]);
      expect(await inbox(other)).toEqual([]);
      expect(await inbox(muted)).toEqual([]);
    });

    it('cancelling tells the people who answered, once; deleting takes the notifications with it', async () => {
      const event = (await create(host, { name: 'Picnic' })).body;
      await answer(guest, event.id, 'interested');
      await request(app).post(`/events/${event.id}/cancel`).set(auth(host));
      await request(app).post(`/events/${event.id}/cancel`).set(auth(host)); // again: no second one
      expect(await inbox(guest)).toEqual([{ type: 'event_cancelled', from: host.username, event: 'Picnic' }]);
      await request(app).delete(`/events/${event.id}`).set(auth(host));
      expect(await inbox(guest)).toEqual([]);
    });

    it('the daily cleanup is a backstop for the ticker', async () => {
      const event = (await create(host)).body;
      await answer(guest, event.id, 'going');
      await startsIn(event.id, 30);
      const cleanup = require('../../services/cleanupService');
      expect((await cleanup.run()).eventRemindersSent).toBe(1);
    });
  });

  it('in the data export', async () => {
    const event = (await create(host, { name: 'Book club' })).body;
    await answer(guest, event.id, 'going');
    expect((await request(app).get('/profile/export').set(auth(host))).body.events.hosted.map((e) => e.name)).toEqual(['Book club']);
    expect((await request(app).get('/profile/export').set(auth(guest))).body.events.responses).toEqual([
      expect.objectContaining({ event_id: event.id, name: 'Book club', status: 'going' })
    ]);
  });
});
