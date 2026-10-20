const http = require('http');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 75 (security round 2): the socket events -- what message_error tells
// the client, and limits on how much a client may send.
describe('socket events: errors and limits', () => {
  const { app, reset } = setupTestApp();
  const errorLog = require('../../services/errorLogService');
  const messageService = require('../../services/messageService');
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);
  beforeEach(() => errorLog.resetThrottle());
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
  const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextError = (socket) => new Promise((resolve) => socket.once('message_error', resolve));

  let a;
  let b;
  let conv;
  let sockets;
  beforeEach(async () => {
    a = await registerAndLogin(app);
    b = await registerAndLogin(app);
    conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
    sockets = [];
  });
  afterEach(async () => {
    sockets.forEach((s) => s.close());
    jest.restoreAllMocks();
    await settle(); // "last seen" is saved before the next test resets the database
    await errorLog.whenIdle();
  });
  const openTracked = async (user) => {
    const socket = await open(user);
    sockets.push(socket);
    return socket;
  };

  it('a NUL character is a validation error, not a server error', async () => {
    const sa = await openTracked(a);
    const answer = nextError(sa);
    sa.emit('send_message', { conversationId: conv.id, content: 'a\u0000b', clientTempId: 't1' });
    expect(await answer).toEqual({ clientTempId: 't1', error: "This text contains a character that can't be saved.", code: 'VALIDATION' });
    await settle();
    await errorLog.whenIdle();
    expect((await pool.query('SELECT count(*)::int AS n FROM error_groups')).rows[0].n).toBe(0);
  });

  it("a server error's own text stays on the server", async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(messageService, 'sendMessage').mockRejectedValue(new Error('relation "secret_table" does not exist'));
    const sa = await openTracked(a);
    const answer = nextError(sa);
    sa.emit('send_message', { conversationId: conv.id, content: 'hi', clientTempId: 't2' });
    expect(await answer).toEqual({ clientTempId: 't2', error: 'Something went wrong. Please try again later.', code: 'SERVER_ERROR' });
  });

  it('passes "typing" on at most once a second per chat', async () => {
    const [sa, sb] = [await openTracked(a), await openTracked(b)];
    await settle();
    let heard = 0;
    sb.on('user_typing', () => { heard += 1; });
    for (let i = 0; i < 5; i += 1) sa.emit('typing', { conversationId: conv.id });
    await settle(400);
    expect(heard).toBe(1);
    await settle(800); // a second later, it goes through again
    sa.emit('typing', { conversationId: conv.id });
    await settle(300);
    expect(heard).toBe(2);
  });

  it('drops events past 120 in 10 seconds from one socket', async () => {
    const markRead = jest.spyOn(messageService, 'markRead');
    const sa = await openTracked(a);
    for (let i = 0; i < 200; i += 1) sa.emit('mark_read', { conversationId: conv.id });
    await settle(1500);
    expect(markRead).toHaveBeenCalledTimes(120);
    // The app's own pace is nowhere near it: another socket is unaffected.
    const sb = await openTracked(b);
    sb.emit('mark_read', { conversationId: conv.id });
    await settle();
    expect(markRead).toHaveBeenCalledTimes(121);
  });

  it('closes a socket that sends an event over 100 kB, and stores nothing', async () => {
    const sa = await openTracked(a);
    const closed = new Promise((resolve) => sa.once('disconnect', resolve));
    sa.emit('send_message', { conversationId: conv.id, content: 'x'.repeat(200 * 1024), clientTempId: 't3' });
    await closed;
    expect((await pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1', [conv.id])).rows[0].n).toBe(0);
  });
});
