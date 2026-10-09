const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 47 step 4: who can message me / comment on my posts (migration 058).
describe('who can message and comment (Day 47)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const setPerm = (user, body) => request(app).put('/profile/interactions').set(auth(user)).send(body);
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));
  const startChat = (a, b) => request(app).post('/conversations').set(auth(a)).send({ userId: b.id });
  const send = (a, conv, content = 'hi') => request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content });
  const NO_MSG = "This person isn't accepting messages from you";

  it('settings: saved, returned by /profile/me and the download; bad values refused', async () => {
    const me = await registerAndLogin(app);
    expect((await request(app).get('/profile/me').set(auth(me))).body).toMatchObject({ message_permission: 'everyone', comment_permission: 'everyone' });
    expect((await setPerm(me, { messagePermission: 'following' })).body).toEqual({ message_permission: 'following', comment_permission: 'everyone' });
    expect((await setPerm(me, { commentPermission: 'followers' })).body).toEqual({ message_permission: 'following', comment_permission: 'followers' });
    for (const body of [{}, { messagePermission: 'friends' }, { commentPermission: 'nobody' }, { messagePermission: 1 }]) {
      expect((await setPerm(me, body)).status).toBe(400);
    }
    expect((await request(app).put('/profile/interactions').send({ messagePermission: 'everyone' })).status).toBe(401);
    const settings = (await request(app).get('/profile/export').set(auth(me))).body.settings;
    expect(settings).toMatchObject({ who_can_message_you: 'following', who_can_comment_on_your_posts: 'followers' });
  });

  it('messages "people I follow": others can\'t start a chat; people I follow can', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    await follow(me, friend);
    await setPerm(me, { messagePermission: 'following' });

    const refused = await startChat(stranger, me);
    expect([refused.status, refused.text]).toEqual([403, NO_MSG]);
    expect((await request(app).get(`/profile/${me.id}`).set(auth(stranger))).body.can_message).toBe(false);
    expect((await request(app).get(`/profile/${me.id}`).set(auth(friend))).body.can_message).toBe(true);
    const chat = (await startChat(friend, me)).body;
    expect((await send(friend, chat)).status).toBe(201);
  });

  it('"no one": an existing chat where I have written goes on; a silent one is refused', async () => {
    const me = await registerAndLogin(app);
    const pal = await registerAndLogin(app);
    const pest = await registerAndLogin(app);
    const palChat = (await startChat(pal, me)).body;
    await send(pal, palChat);
    await send(me, palChat, 'hey pal');
    const pestChat = (await startChat(pest, me)).body;
    await send(pest, pestChat);

    await setPerm(me, { messagePermission: 'nobody' });
    expect((await send(pal, palChat, 'still here')).status).toBe(201);
    const refused = await send(pest, pestChat, 'again');
    expect([refused.status, refused.text]).toEqual([403, NO_MSG]);
    // (Voice, image, forward and reactions share the same check:
    // messageService.assertNotBlocked runs on every send.)
    // I can always write to them; once I have, they may answer.
    expect((await send(me, pestChat, 'what do you want?')).status).toBe(201);
    expect((await send(pest, pestChat, 'sorry')).status).toBe(201);
    expect((await request(app).get(`/profile/${me.id}`).set(auth(pest))).body.can_message).toBe(true);
  });

  it('comments "my followers" / "people I follow"; group and page posts are not affected', async () => {
    const me = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    await follow(fan, me);
    await follow(me, friend);
    const post = (await request(app).post('/posts').set(auth(me)).field('content', 'mine')).body;
    const comment = (u) => request(app).post(`/posts/${post.id}/comments`).set(auth(u)).send({ content: 'nice' });

    await setPerm(me, { commentPermission: 'followers' });
    expect((await comment(fan)).status).toBe(201);
    const refused = await comment(stranger);
    expect([refused.status, refused.text]).toEqual([403, 'This person limits who can comment on their posts']);
    expect((await comment(friend)).status).toBe(403);
    expect((await comment(me)).status).toBe(201);

    await setPerm(me, { commentPermission: 'following' });
    expect((await comment(friend)).status).toBe(201);
    expect((await comment(fan)).status).toBe(403);

    const group = (await request(app).post('/communities').set(auth(me)).send({ name: 'Open', privacy: 'public' })).body;
    await request(app).post(`/communities/${group.id}/join`).set(auth(stranger));
    const groupPost = (await request(app).post('/posts').set(auth(me)).field('content', 'group').field('communityId', String(group.id))).body;
    expect((await request(app).post(`/posts/${groupPost.id}/comments`).set(auth(stranger)).send({ content: 'ok' })).status).toBe(201);
  });
});
