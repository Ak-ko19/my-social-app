const request = require('supertest');

let counter = 0;

// Unique-per-call so tests can create several users without colliding on
// the real UNIQUE(username)/UNIQUE(email) constraints.
function uniqueUser(overrides = {}) {
  counter += 1;
  return {
    username: `user${counter}_${Date.now()}`,
    email: `user${counter}_${Date.now()}@example.com`,
    password: 'a-fine-password-123',
    ...overrides
  };
}

// Signs up and logs in through the real API (not a shortcut/JWT forged by
// hand) so these tests also exercise the real signup/login path every
// time they're used as setup for something else.
async function registerAndLogin(app, overrides = {}) {
  const creds = uniqueUser(overrides);
  const signupRes = await request(app).post('/signup').send(creds);
  if (signupRes.status !== 201) {
    throw new Error(`registerAndLogin: signup failed (${signupRes.status}): ${signupRes.text}`);
  }
  const loginRes = await request(app).post('/login').send({ email: creds.email, password: creds.password });
  if (loginRes.status !== 200) {
    throw new Error(`registerAndLogin: login failed (${loginRes.status}): ${loginRes.text}`);
  }
  return { ...creds, id: loginRes.body.id, token: loginRes.body.token };
}

module.exports = { uniqueUser, registerAndLogin };
