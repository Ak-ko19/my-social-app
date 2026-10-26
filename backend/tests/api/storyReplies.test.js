const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const { resetMessageRateLimits } = require('../../services/rateLimiter');
const { STORY_REACTIONS } = require('../../config/storyReactions');
const fs = require('fs');
const path = require('path');

// Day 100: replying and reacting to a story -- a direct message to its
// author with the story attached (migration 082).
describe('story replies and reactions (Day 100)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const postStory = async (user, fields = {}) => {
    const req = request(app).post('/stories').set(auth(user));
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return (await req.attach('image', png, { filename: 's.png', contentType: 'image/png' })).body;
  };
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));
  const reply = (user, story, text) => request(app).post(`/stories/${story.id}/reply`).set(auth(user)).send({ text });
  const react = (user, story, emoji) => request(app).post(`/stories/${story.id}/react`).set(auth(user)).send({ emoji });
  const history = async (user, conversationId) =>
    (await request(app).get(`/conversations/${conversationId}/messages`).set(auth(user))).body.messages;
  const NO_MSG = "This person isn't accepting messages from you";

  async function fanAndAuthor() {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await follow(fan, author);
    return { author, fan, story: await postStory(author) };
  }

  it('a reply opens a chat with the author and arrives with the story attached', async () => {
    const { author, fan, story } = await fanAndAuthor();
    const res = await reply(fan, story, '  Lovely view!  ');
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({
      sender_id: fan.id,
      type: 'text',
      content: 'Lovely view!',
      story_id: story.id,
      story_reply: 'reply',
      story: { id: story.id, media_url: story.media_url }
    });

    // The author sees it in their inbox and in the chat, story and all.
    const inbox = (await request(app).get('/conversations').set(auth(author))).body.conversations;
    expect(inbox.map((c) => c.conversation_id)).toEqual([res.body.conversationId]);
    const [msg] = await history(author, res.body.conversationId);
    expect(msg).toMatchObject({ content: 'Lovely view!', story_reply: 'reply', story: { id: story.id } });
  });

  it('a reaction is the emoji itself; a second reply reuses the same chat', async () => {
    const { author, fan, story } = await fanAndAuthor();
    const first = await react(fan, story, '🔥');
    expect(first.status).toBe(201);
    expect(first.body.message).toMatchObject({ content: '🔥', story_reply: 'reaction', story: { id: story.id } });
    const second = await reply(fan, story, 'and again');
    expect(second.body.conversationId).toBe(first.body.conversationId);
    // An earlier chat between them is the one used too.
    const opened = await request(app).post('/conversations').set(auth(author)).send({ userId: fan.id });
    expect(opened.status).toBe(200);
    expect(opened.body.id).toBe(first.body.conversationId);
  });

  it("the app offers exactly the server's reactions, in the same order", () => {
    const appList = fs.readFileSync(path.join(__dirname, '../../../frontend/src/components/feed/storyReactions.js'), 'utf8');
    expect([...appList.matchAll(/emoji: '([^']+)'/g)].map((m) => m[1])).toEqual(STORY_REACTIONS);
  });

  it('refuses an unknown emoji, empty or too long text', async () => {
    const { fan, story } = await fanAndAuthor();
    expect((await react(fan, story, '💩')).status).toBe(400);
    expect((await react(fan, story, undefined)).status).toBe(400);
    expect((await reply(fan, story, '   ')).status).toBe(400);
    expect((await reply(fan, story, 'x'.repeat(5001))).status).toBe(400);
    // A refused first reply leaves no empty chat behind.
    expect((await pool.query('SELECT count(*)::int AS n FROM conversations')).rows[0].n).toBe(0);
    expect((await reply(fan, story, 'x'.repeat(5000))).status).toBe(201);
  });

  it("only a story you can see: not a stranger's, not an expired one (404); never your own (400)", async () => {
    const { author, fan, story } = await fanAndAuthor();
    const stranger = await registerAndLogin(app);
    expect((await reply(stranger, story, 'hi')).status).toBe(404);
    expect((await reply(author, story, 'me')).status).toBe(400);
    expect((await request(app).post('/stories/999999/reply').set(auth(fan)).send({ text: 'hi' })).status).toBe(404);
    await pool.query("UPDATE stories SET expires_at = now() - interval '1 minute' WHERE id = $1", [story.id]);
    expect((await reply(fan, story, 'late')).status).toBe(404);
    expect((await request(app).post(`/stories/${story.id}/reply`).send({ text: 'hi' })).status).toBe(401);
  });

  it("a close-friends story only takes replies from the author's close friends", async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    await follow(fan, author);
    await follow(friend, author);
    await request(app).put(`/close-friends/${friend.id}`).set(auth(author));
    const story = await postStory(author, { closeFriends: 'true' });
    expect((await reply(fan, story, 'hi')).status).toBe(404);
    expect((await reply(friend, story, 'hi')).status).toBe(201);
  });

  it('a block either way stops replies', async () => {
    const { author, fan, story } = await fanAndAuthor();
    await request(app).post(`/users/${fan.id}/block`).set(auth(author));
    expect((await reply(fan, story, 'hi')).status).toBe(404);
    await request(app).delete(`/users/${fan.id}/block`).set(auth(author));
    await follow(fan, author);
    await request(app).post(`/users/${author.id}/block`).set(auth(fan));
    expect((await react(fan, story, '😍')).status).toBe(404);
  });

  it('"who can message me" applies: nobody refuses a new chat; an existing one still goes on', async () => {
    const { author, fan, story } = await fanAndAuthor();
    await request(app).put('/profile/interactions').set(auth(author)).send({ messagePermission: 'nobody' });
    const refused = await reply(fan, story, 'hi');
    expect(refused.status).toBe(403);
    expect(refused.text).toBe(NO_MSG);
    expect((await pool.query('SELECT count(*)::int AS n FROM conversations')).rows[0].n).toBe(0);

    // Once the author has written to them, the chat goes on (Day 47 rule).
    await request(app).put('/profile/interactions').set(auth(author)).send({ messagePermission: 'everyone' });
    const chat = (await request(app).post('/conversations').set(auth(author)).send({ userId: fan.id })).body;
    await request(app).post(`/conversations/${chat.id}/messages`).set(auth(author)).send({ content: 'hey' });
    await request(app).put('/profile/interactions').set(auth(author)).send({ messagePermission: 'nobody' });
    expect((await reply(fan, story, 'hi again')).status).toBe(201);
  });

  it('tray: can_reply is false for your own stories and for authors who take no messages from you', async () => {
    const { author, fan } = await fanAndAuthor();
    await postStory(fan);
    const tray = async () => (await request(app).get('/stories').set(auth(fan))).body;
    expect((await tray()).map((g) => [g.is_own, g.can_reply])).toEqual([
      [true, false],
      [false, true]
    ]);
    await request(app).put('/profile/interactions').set(auth(author)).send({ messagePermission: 'following' });
    expect((await tray())[1].can_reply).toBe(false);
    await follow(author, fan);
    expect((await tray())[1].can_reply).toBe(true);
  });

  it('after the story is gone the message stays, still a story reply, without the story', async () => {
    const { author, fan, story } = await fanAndAuthor();
    const { conversationId } = (await reply(fan, story, 'nice')).body;
    // Expired: no longer shown, even before the cleanup deletes it.
    await pool.query("UPDATE stories SET expires_at = now() - interval '1 minute' WHERE id = $1", [story.id]);
    expect((await history(author, conversationId))[0]).toMatchObject({ story_id: story.id, story_reply: 'reply', story: null });
    // Deleted: the link is cleared, the message and its kind stay.
    await request(app).delete(`/stories/${story.id}`).set(auth(author));
    expect((await history(fan, conversationId))[0]).toMatchObject({ content: 'nice', story_id: null, story_reply: 'reply', story: null });
  });

  it('a later block hides the story in the chat; an unsent reply has no story', async () => {
    const { author, fan, story } = await fanAndAuthor();
    const { conversationId, message } = (await reply(fan, story, 'nice')).body;
    await react(fan, story, '👏');
    await request(app).delete(`/conversations/${conversationId}/messages/${message.id}`).set(auth(fan));
    const [unsent, reaction] = await history(author, conversationId);
    expect(unsent).toMatchObject({ content: null, story: null });
    expect(reaction.story).toMatchObject({ id: story.id });
    await request(app).post(`/users/${fan.id}/block`).set(auth(author));
    expect((await history(author, conversationId))[1].story).toBeNull();
  });

  it('a forwarded story reply is plain text, without the story', async () => {
    const { fan, story } = await fanAndAuthor();
    const other = await registerAndLogin(app);
    const target = (await request(app).post('/conversations').set(auth(fan)).send({ userId: other.id })).body;
    const { conversationId, message } = (await reply(fan, story, 'look at this')).body;
    const fwd = await request(app)
      .post(`/conversations/${conversationId}/messages/${message.id}/forward`)
      .set(auth(fan))
      .send({ conversationIds: [target.id] });
    expect(fwd.status).toBe(201);
    expect((await history(other, target.id))[0]).toMatchObject({ content: 'look at this', story_id: null, story_reply: null, story: null });
  });

  it("a reaction can't be edited into text; a reply can, like any message", async () => {
    const { fan, story } = await fanAndAuthor();
    const reacted = (await react(fan, story, '😂')).body;
    const replied = (await reply(fan, story, 'typo')).body;
    const edit = (sent, content) =>
      request(app).put(`/conversations/${sent.conversationId}/messages/${sent.message.id}`).set(auth(fan)).send({ content });
    const refused = await edit(reacted, 'something else');
    expect(refused.status).toBe(403);
    expect(refused.text).toBe("A reaction to a story can't be edited");
    const fixed = await edit(replied, 'fixed');
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ content: 'fixed', story_reply: 'reply', story: { id: story.id } });
  });

  it('the data export says which messages answered a story', async () => {
    const { fan, story } = await fanAndAuthor();
    await reply(fan, story, 'nice');
    await react(fan, story, '🎉');
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(fan))).text);
    expect(data.conversations[0].messages.map((m) => [m.content, m.story_reply])).toEqual([
      ['nice', 'reply'],
      ['🎉', 'reaction']
    ]);
  });
});
