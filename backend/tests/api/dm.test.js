const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

describe('DM (conversations + messages)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  it('creates a new direct conversation', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const res = await request(app)
      .post('/conversations')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ userId: b.id });
    expect(res.status).toBe(201);
    expect(res.body.other_user_id).toBe(b.id);
  });

  it('returns the same conversation on a second create call (no duplicate)', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const first = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });
    const second = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it('rejects starting a conversation with yourself', async () => {
    const a = await registerAndLogin(app);
    const res = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: a.id });
    expect(res.status).toBe(400);
  });

  it('rejects starting a conversation with a user who blocked you', async () => {
    const blocker = await registerAndLogin(app);
    const blocked = await registerAndLogin(app);
    await request(app).post(`/users/${blocked.id}/block`).set('Authorization', `Bearer ${blocker.token}`);

    const res = await request(app)
      .post('/conversations')
      .set('Authorization', `Bearer ${blocked.token}`)
      .send({ userId: blocker.id });
    expect(res.status).toBe(403);
  });

  it('sends a text message', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });

    const send = await request(app)
      .post(`/conversations/${conv.body.id}/messages`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ content: 'hey there' });
    expect(send.status).toBe(201);
    expect(send.body.content).toBe('hey there');
  });

  it('retrieves message history', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });
    await request(app).post(`/conversations/${conv.body.id}/messages`).set('Authorization', `Bearer ${a.token}`).send({ content: 'hey there' });

    const messages = await request(app)
      .get(`/conversations/${conv.body.id}/messages`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(messages.status).toBe(200);
    expect(messages.body.messages.map((m) => m.content)).toContain('hey there');
  });

  it('rejects sending a message from a non-participant', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });

    const res = await request(app)
      .post(`/conversations/${conv.body.id}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ content: 'i should not be able to send this' });
    expect(res.status).toBe(403);
  });

  it('strips HTML/script content from a message before storing it', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });

    const send = await request(app)
      .post(`/conversations/${conv.body.id}/messages`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ content: '<script>alert(1)</script>hello' });
    expect(send.status).toBe(201);
    expect(send.body.content).toBe('hello');
  });

  it('rejects an empty message', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });

    const res = await request(app)
      .post(`/conversations/${conv.body.id}/messages`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('a message becomes blocked mid-conversation once either side blocks the other', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });
    await request(app).post(`/conversations/${conv.body.id}/messages`).set('Authorization', `Bearer ${a.token}`).send({ content: 'before block' });

    await request(app).post(`/users/${a.id}/block`).set('Authorization', `Bearer ${b.token}`);

    const res = await request(app)
      .post(`/conversations/${conv.body.id}/messages`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ content: 'after block' });
    expect(res.status).toBe(403);
  });

  it('the sender can delete their own message and its content is scrubbed', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });
    const send = await request(app)
      .post(`/conversations/${conv.body.id}/messages`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ content: 'oops' });

    const del = await request(app)
      .delete(`/conversations/${conv.body.id}/messages/${send.body.id}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(del.status).toBe(200);
    expect(del.body.content).toBeNull();

    // The deleted content must also be scrubbed from the history listing,
    // not just from the delete response.
    const history = await request(app)
      .get(`/conversations/${conv.body.id}/messages`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(history.status).toBe(200);
    const deleted = history.body.messages.find((m) => m.id === send.body.id);
    expect(deleted.content).toBeNull();
  });

  it('rejects deleting the other participant\'s message', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });
    const send = await request(app)
      .post(`/conversations/${conv.body.id}/messages`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ content: 'mine, not yours' });

    const res = await request(app)
      .delete(`/conversations/${conv.body.id}/messages/${send.body.id}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(403);
  });

  it('marks a conversation read', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });
    await request(app).post(`/conversations/${conv.body.id}/messages`).set('Authorization', `Bearer ${a.token}`).send({ content: 'read me' });

    const res = await request(app).put(`/conversations/${conv.body.id}/read`).set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(200);
  });

  it('reflects the read state in the conversation list', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = await request(app).post('/conversations').set('Authorization', `Bearer ${a.token}`).send({ userId: b.id });
    await request(app).post(`/conversations/${conv.body.id}/messages`).set('Authorization', `Bearer ${a.token}`).send({ content: 'read me' });
    await request(app).put(`/conversations/${conv.body.id}/read`).set('Authorization', `Bearer ${b.token}`);

    const list = await request(app).get('/conversations').set('Authorization', `Bearer ${b.token}`);
    const entry = list.body.find((c) => c.conversation_id === conv.body.id);
    expect(entry.unread_count).toBe(0);
  });
});
