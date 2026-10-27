const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 105: hiding the "Finish your profile" card for good (migration 085).
describe('the Finish-your-profile card (Day 105)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const me = async (user) => (await request(app).get('/profile/me').set(auth(user))).body;

  it('shown until hidden; hidden for good, the first time kept', async () => {
    const ana = await registerAndLogin(app);
    expect((await me(ana)).profile_card_dismissed_at).toBeNull();
    const first = await request(app).post('/profile/completion/dismiss').set(auth(ana));
    expect(first.status).toBe(200);
    expect(first.body.profile_card_dismissed_at).toEqual(expect.any(String));
    expect((await me(ana)).profile_card_dismissed_at).toBe(first.body.profile_card_dismissed_at);
    const again = await request(app).post('/profile/completion/dismiss').set(auth(ana));
    expect(again.body.profile_card_dismissed_at).toBe(first.body.profile_card_dismissed_at);
  });

  it("only your own; someone else's profile doesn't say it; logged out is 401", async () => {
    const ana = await registerAndLogin(app);
    const bo = await registerAndLogin(app);
    await request(app).post('/profile/completion/dismiss').set(auth(ana));
    expect((await me(bo)).profile_card_dismissed_at).toBeNull();
    expect((await request(app).get(`/profile/${ana.id}`).set(auth(bo))).body).not.toHaveProperty('profile_card_dismissed_at');
    expect((await request(app).post('/profile/completion/dismiss')).status).toBe(401);
  });

  it('is in your data export', async () => {
    const ana = await registerAndLogin(app);
    await request(app).post('/profile/completion/dismiss').set(auth(ana));
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(ana))).text);
    expect(data.profile.profile_card_dismissed_at).toEqual(expect.any(String));
  });
});
