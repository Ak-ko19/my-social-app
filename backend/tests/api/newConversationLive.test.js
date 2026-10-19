const http = require('http');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 64 (found by the journeys suite): a brand-new direct chat is live
// at once. Sockets join their chats' rooms when they connect, so the
// people in a chat created after that were never in its room -- the first
// messages only showed up after a reload.
describe('a new direct chat is live at once (Day 64)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

  let server;
  let url;
  beforeAll(async () => {
    const { initSocket } = require('../../sockets');
    server = http.createServer(app);
    initSocket(server);
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
  });
  afterAll(async () => {
    require('../../sockets').getIO().close();
    await new Promise((resolve) => server.close(resolve));
  });
  const open = (user) => new Promise((resolve, reject) => {
    const socket = connect(url, { auth: { token: user.token }, transports: ['websocket'], reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

  it('both people, already online, get the first messages; nobody else does', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    // Everyone has the app open before the chat exists.
    const [sa, sb, so] = await Promise.all([open(a), open(b), open(outsider)]);
    const heard = { a: [], b: [], outsider: [] };
    sa.on('new_message', (m) => heard.a.push(m.content));
    sb.on('new_message', (m) => heard.b.push(m.content));
    so.on('new_message', (m) => heard.outsider.push(m.content));
    await settle();

    const conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
    await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content: 'hi b' });
    await request(app).post(`/conversations/${conv.id}/messages`).set(auth(b)).send({ content: 'hi a' });
    await settle();

    expect(heard.b).toEqual(['hi b', 'hi a']);
    expect(heard.a).toEqual(['hi b', 'hi a']);
    expect(heard.outsider).toEqual([]);
    [sa, sb, so].forEach((s) => s.close());
    await settle(); // the server saves each "last seen" before the pool closes
  });
});
