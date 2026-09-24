const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

describe('profile', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  it('GET /profile/me returns the owner view including email', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app).get('/profile/me').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe(user.username);
    expect(res.body.email).toBe(user.email);
  });

  it('GET /profile/:id returns the public view without email', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app).get(`/profile/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe(user.username);
    expect(res.body.email).toBeUndefined();
  });

  it('GET /profile/:username resolves by username too', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app).get(`/profile/${user.username}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
  });

  it('404s for a nonexistent profile', async () => {
    const res = await request(app).get('/profile/999999');
    expect(res.status).toBe(404);
  });

  it('PUT /profile updates username/email/bio', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app)
      .put('/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .field('username', user.username)
      .field('email', user.email)
      .field('bio', 'updated bio');
    expect(res.status).toBe(200);
    expect(res.body.bio).toBe('updated bio');
  });

  it('PUT /profile/privacy flips is_private', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app)
      .put('/profile/privacy')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ isPrivate: true });
    expect(res.status).toBe(200);
    expect(res.body.is_private).toBe(true);

    const publicView = await request(app).get(`/profile/${user.id}`);
    expect(publicView.body.is_private).toBe(true);
  });

  it('rejects updating to a username that is already taken', async () => {
    const userA = await registerAndLogin(app);
    const userB = await registerAndLogin(app);
    const res = await request(app)
      .put('/profile')
      .set('Authorization', `Bearer ${userB.token}`)
      .field('username', userA.username)
      .field('email', userB.email);
    expect(res.status).toBe(400);
  });
});
