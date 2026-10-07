const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 45 step 4: "poll ended" -- the author and the voters who can still
// see the post are told, once (services/pollEndService).
describe('poll ended notifications (Day 45)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const pollEnd = require('../../services/pollEndService');
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const makePoll = async (author, fields = {}) => {
    let req = request(app).post('/posts').set(auth(author)).field('content', 'Tea or coffee?')
      .field('poll', JSON.stringify({ options: ['Tea', 'Coffee'] }));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    const post = (await req).body;
    expect(post.poll).toBeTruthy();
    return post;
  };
  const vote = async (user, post, i = 0) => {
    const res = await request(app).post(`/posts/${post.id}/poll/vote`).set(auth(user)).send({ optionId: post.poll.options[i].id });
    expect(res.status).toBeLessThan(300);
  };
  const end = (post) => pool.query("UPDATE polls SET closes_at = now() - interval '1 minute' WHERE post_id = $1", [post.id]);
  const told = async (postId) => (await pool.query(
    "SELECT user_id, actor_id, type FROM notifications WHERE post_id = $1 AND type IN ('poll_ended', 'poll_ended_own') ORDER BY user_id",
    [postId]
  )).rows;

  it('tells the author and every voter, once -- not before it ends', async () => {
    const author = await registerAndLogin(app);
    const [a, b, outsider] = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
    const post = await makePoll(author);
    await vote(a, post, 0);
    await vote(b, post, 1);
    await vote(author, post, 0); // voting on your own poll: one notification, the author's
    expect(await pollEnd.notifyEnded()).toEqual({ polls: 0, people: 0 });

    await end(post);
    expect(await pollEnd.notifyEnded()).toEqual({ polls: 1, people: 3 });
    expect(await told(post.id)).toEqual([
      { user_id: author.id, actor_id: author.id, type: 'poll_ended_own' },
      { user_id: a.id, actor_id: author.id, type: 'poll_ended' },
      { user_id: b.id, actor_id: author.id, type: 'poll_ended' }
    ]);
    expect(await pollEnd.notifyEnded()).toEqual({ polls: 0, people: 0 });
    expect(await told(post.id)).toHaveLength(3);

    // It shows in the voter's list, with the author as the actor.
    const [note] = (await request(app).get('/notifications').set(auth(a))).body.notifications;
    expect(note).toMatchObject({ type: 'poll_ended', actor_username: author.username, post_content: 'Tea or coffee?' });
    expect((await request(app).get('/notifications').set(auth(outsider))).body.notifications).toEqual([]);
  });

  it('a block either way: not told (public poll)', async () => {
    const author = await registerAndLogin(app);
    const [fan, blocker, blocked] = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
    const post = await makePoll(author);
    for (const u of [fan, blocker, blocked]) await vote(u, post);
    await request(app).post(`/users/${author.id}/block`).set(auth(blocker));
    await request(app).post(`/users/${blocked.id}/block`).set(auth(author));
    await end(post);
    await pollEnd.notifyEnded();
    expect((await told(post.id)).map((n) => n.user_id).sort()).toEqual([author.id, fan.id].sort());
  });

  it('followers-only: only people who still follow', async () => {
    const author = await registerAndLogin(app);
    const [fan, unfollower] = [await registerAndLogin(app), await registerAndLogin(app)];
    for (const u of [fan, unfollower]) await request(app).post(`/users/${author.id}/follow`).set(auth(u));
    const post = await makePoll(author, { visibility: 'followers' });
    for (const u of [fan, unfollower]) await vote(u, post);
    await request(app).delete(`/users/${author.id}/follow`).set(auth(unfollower));
    await end(post);
    await pollEnd.notifyEnded();
    expect((await told(post.id)).map((n) => n.user_id).sort()).toEqual([author.id, fan.id].sort());
  });

  it('a private account: only accepted followers', async () => {
    const author = await registerAndLogin(app);
    const [fan, gone] = [await registerAndLogin(app), await registerAndLogin(app)];
    await pool.query('INSERT INTO follows (follower_id, following_id, status) VALUES ($1, $3, $4), ($2, $3, $4)', [fan.id, gone.id, author.id, 'accepted']);
    await pool.query('UPDATE users SET is_private = true WHERE id = $1', [author.id]);
    const post = await makePoll(author); // public audience, private account
    for (const u of [fan, gone]) await vote(u, post);
    await pool.query('DELETE FROM follows WHERE follower_id = $1', [gone.id]);
    await end(post);
    await pollEnd.notifyEnded();
    expect((await told(post.id)).map((n) => n.user_id).sort()).toEqual([author.id, fan.id].sort());
  });

  it('"only me" now, or a deactivated author: only the author hears', async () => {
    const voter = await registerAndLogin(app);
    const private_ = await registerAndLogin(app);
    const hidden = await makePoll(private_);
    await vote(voter, hidden);
    await pool.query("UPDATE posts SET visibility = 'only_me' WHERE id = $1", [hidden.id]);
    const leaver = await registerAndLogin(app);
    const gone = await makePoll(leaver);
    await vote(voter, gone);
    await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [leaver.id]);
    await end(hidden);
    await end(gone);
    expect(await pollEnd.notifyEnded()).toEqual({ polls: 2, people: 2 });
    for (const post of [hidden, gone]) expect((await told(post.id)).map((n) => n.type)).toEqual(['poll_ended_own']);
  });

  it('a private group: members who left are not told; a page poll reaches everyone', async () => {
    const owner = await registerAndLogin(app);
    const stays = await registerAndLogin(app);
    const leaves = await registerAndLogin(app);
    const group = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Secret', privacy: 'private' })).body;
    for (const u of [stays, leaves]) {
      await request(app).post(`/communities/${group.id}/join`).set(auth(u));
      await request(app).post(`/communities/${group.id}/requests/${u.id}/approve`).set(auth(owner));
    }
    const inGroup = await makePoll(owner, { communityId: String(group.id) });
    await vote(stays, inGroup);
    await vote(leaves, inGroup);
    await request(app).delete(`/communities/${group.id}/members/${leaves.id}`).set(auth(owner));

    const page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Cafe', category: 'business' })).body;
    const onPage = await makePoll(owner, { pageId: String(page.id) });
    await vote(leaves, onPage);

    await end(inGroup);
    await end(onPage);
    await pollEnd.notifyEnded();
    expect((await told(inGroup.id)).map((n) => n.user_id)).toEqual([owner.id, stays.id]);
    expect((await told(onPage.id)).map((n) => n.user_id)).toEqual([owner.id, leaves.id]);
  });

  it('two runs at once tell everyone once', async () => {
    const author = await registerAndLogin(app);
    const voter = await registerAndLogin(app);
    for (let i = 0; i < 3; i += 1) {
      const post = await makePoll(author);
      await vote(voter, post);
      await end(post);
    }
    const runs = await Promise.all([pollEnd.notifyEnded(), pollEnd.notifyEnded(), pollEnd.notifyEnded()]);
    expect(runs.reduce((n, r) => n + r.polls, 0)).toBe(3);
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM notifications WHERE type LIKE 'poll_ended%'")).rows[0].n).toBe(6);
  });

  it('the ticker and the daily cleanup both run it', async () => {
    const author = await registerAndLogin(app);
    const first = await makePoll(author);
    await end(first);
    await require('../../services/ticker').tick();
    expect(await told(first.id)).toHaveLength(1);

    const cleanup = require('../../services/cleanupService');
    const second = await makePoll(author);
    await end(second);
    expect((await cleanup.run({ dryRun: true })).endedPollsWaiting).toBe(1);
    expect((await cleanup.run()).endedPollsNotified).toBe(1);
  });

  it('migration 053: polls that had already ended are not notified after it', async () => {
    const author = await registerAndLogin(app);
    const old = await makePoll(author);
    const open = await makePoll(author);
    await end(old);
    const sql = (dir) => fs.readFileSync(path.join(__dirname, '../../migrations', `053_add_poll_ended_notified.${dir}.sql`), 'utf8');
    await pool.query(sql('down'));
    await pool.query(sql('up'));
    expect(await pollEnd.countWaiting()).toBe(0);
    await end(open);
    expect(await pollEnd.notifyEnded()).toEqual({ polls: 1, people: 1 });
    expect(await told(old.id)).toEqual([]);
  });

  it('push text, in English and Arabic', () => {
    const { pushText } = require('../../config/pushText');
    expect(pushText('en', 'poll_ended', { name: 'ana' })).toBe("ana's poll has ended. See the results.");
    expect(pushText('ar', 'poll_ended', { name: 'ana' })).toBe('انتهى استطلاع ana. اطّلع على النتائج.');
    expect(pushText('ar', 'poll_ended_own', {})).toBe('انتهى استطلاعك. اطّلع على النتائج.');
  });
});
