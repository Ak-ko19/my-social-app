const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 36: up to 3 links on a profile -- web addresses only, normalized,
// public like the bio.
describe('profile links (Day 36)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  // The app sends the edit form as multipart, so links arrive as JSON text.
  const save = (user, fields) => {
    const req = request(app).put('/profile').set(auth(user)).field('username', user.username).field('email', user.email);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req;
  };

  it('saves links, normalized: a scheme is added, case is fixed, repeats dropped', async () => {
    const me = await registerAndLogin(app);
    const res = await save(me, { links: JSON.stringify(['example.com', 'HTTPS://Shop.example.org/tea?x=1', 'https://example.com/']) });
    expect(res.status).toBe(200);
    expect(res.body.links).toEqual(['https://example.com/', 'https://shop.example.org/tea?x=1']);
  });

  it('they show on the public profile and in /profile/me', async () => {
    const me = await registerAndLogin(app);
    await save(me, { links: JSON.stringify(['mysite.dev']) });
    const viewer = await registerAndLogin(app);
    expect((await request(app).get(`/profile/${me.id}`).set(auth(viewer))).body.links).toEqual(['https://mysite.dev/']);
    expect((await request(app).get(`/profile/${me.id}`)).body.links).toEqual(['https://mysite.dev/']); // logged out
    expect((await request(app).get('/profile/me').set(auth(me))).body).toMatchObject({ links: ['https://mysite.dev/'], created_at: expect.any(String) });
  });

  it('refuses anything that isn\'t a web address, and more than 3', async () => {
    const me = await registerAndLogin(app);
    // javascript://host/... and ftp://host pass a host check -- only the
    // scheme check stops them.
    for (const bad of [['javascript:alert(1)'], ['javascript://example.com/%0Aalert(1)'], ['ftp://files.example'], ['data:text/html,hi'], ['mailto:a@b.com'], ['http://user:pass@evil.example'], ['localhost'],
      ['a.com', 'b.com', 'c.com', 'd.com'], [`${'x'.repeat(200)}.com`], ['has space.com'], [42]]) {
      const res = await save(me, { links: JSON.stringify(bad) });
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/Links must be web addresses/);
    }
    expect((await save(me, { links: 'not json' })).status).toBe(400);
    expect((await request(app).get('/profile/me').set(auth(me))).body.links).toEqual([]);
  });

  it('an edit that doesn\'t send links keeps them; an empty list clears them', async () => {
    const me = await registerAndLogin(app);
    await save(me, { links: JSON.stringify(['tea.example']) });
    const kept = await save(me, { bio: 'new bio' });
    expect(kept.body).toMatchObject({ bio: 'new bio', links: ['https://tea.example/'] });
    expect((await save(me, { links: '[]' })).body.links).toEqual([]);
  });

  it('empty fields are ignored', async () => {
    const me = await registerAndLogin(app);
    expect((await save(me, { links: JSON.stringify(['', '  ', 'ok.example']) })).body.links).toEqual(['https://ok.example/']);
  });

  it('the data download includes them', async () => {
    const me = await registerAndLogin(app);
    await save(me, { links: JSON.stringify(['tea.example']) });
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(me))).text);
    expect(data.profile.links).toEqual(['https://tea.example/']);
  });
});
