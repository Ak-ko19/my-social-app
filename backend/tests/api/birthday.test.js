const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 111: a birthday (month and day, never a year) and who sees it.
describe('birthday on the profile (Day 111)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const save = (user, body) => request(app).put('/profile/birthday').set(auth(user)).send(body);
  const seenBy = async (viewer, owner) => {
    const req = request(app).get(`/profile/${owner.id}`);
    return (await (viewer ? req.set(auth(viewer)) : req)).body.birthday;
  };
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));

  let ann;
  let bea;
  let cal;
  beforeEach(async () => {
    ann = await registerAndLogin(app);
    bea = await registerAndLogin(app);
    cal = await registerAndLogin(app);
  });

  it('saves month and day (Feb 29 too), keeps who sees it unless given, clears with nulls; /profile/me and the export have it', async () => {
    const me0 = (await request(app).get('/profile/me').set(auth(ann))).body;
    expect(me0).toMatchObject({ birthday_month: null, birthday_day: null, birthday_audience: 'friends' });
    expect((await save(ann, { month: 2, day: 29 })).body).toEqual({ birthday: { month: 2, day: 29 }, birthday_audience: 'friends' });
    expect((await save(ann, { month: 3, day: 5, audience: 'public' })).body).toEqual({ birthday: { month: 3, day: 5 }, birthday_audience: 'public' });
    expect((await request(app).get('/profile/me').set(auth(ann))).body).toMatchObject({ birthday_month: 3, birthday_day: 5, birthday_audience: 'public' });
    const exported = (await request(app).get('/profile/export').set(auth(ann))).body;
    expect(exported.profile).toMatchObject({ birthday_month: 3, birthday_day: 5, birthday_audience: 'public' });
    expect(exported.profile).not.toHaveProperty('birthday_year');
    expect((await save(ann, { month: null, day: null })).body).toEqual({ birthday: null, birthday_audience: 'public' });
    expect(await seenBy(null, ann)).toBeNull();
  });

  it('refuses a day the month does not have, half a birthday, and unknown audiences', async () => {
    for (const [body, text] of [
      [{ month: 4, day: 31 }, 'Choose a day that is in that month.'],
      [{ month: 2, day: 30 }, 'Choose a day that is in that month.'],
      [{ month: 13, day: 1 }, 'Choose a month.'],
      [{ month: 5 }, 'Choose a day that is in that month.'],
      [{ day: 5 }, 'Choose a month.'],
      [{ month: '5', day: 5 }, 'Choose a month.'],
      [{ month: 5, day: 5, audience: 'everyone' }, 'audience must be only_me, friends or public']
    ]) {
      const res = await save(ann, body);
      expect([JSON.stringify(body), res.status, res.text]).toEqual([JSON.stringify(body), 400, text]);
    }
    expect((await request(app).put('/profile/birthday').send({ month: 1, day: 1 })).status).toBe(401);
  });

  it('who sees it: only you (only me); friends -- following each other -- (friends); everyone (public); never across a block', async () => {
    await save(ann, { month: 7, day: 14, audience: 'only_me' });
    expect(await seenBy(ann, ann)).toEqual({ month: 7, day: 14 });
    await follow(bea, ann);
    await follow(ann, bea);
    expect(await seenBy(bea, ann)).toBeNull();

    await save(ann, { month: 7, day: 14, audience: 'friends' });
    expect(await seenBy(bea, ann)).toEqual({ month: 7, day: 14 });
    await follow(cal, ann); // follows her, but she doesn't follow back
    expect(await seenBy(cal, ann)).toBeNull();
    expect(await seenBy(null, ann)).toBeNull();

    await save(ann, { month: 7, day: 14, audience: 'public' });
    expect(await seenBy(null, ann)).toEqual({ month: 7, day: 14 });
    await request(app).post(`/users/${cal.id}/block`).set(auth(ann));
    expect((await request(app).get(`/profile/${ann.id}`).set(auth(cal))).status).toBe(404);
  });
});
