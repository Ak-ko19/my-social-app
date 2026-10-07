const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const { toUnicode } = require('../../utils/myanmarText');

// Day 43: Zawgyi -> Unicode on the way in (utils/myanmarText).
// "Hello Maung Maung, how are you" typed with a Zawgyi font, and the same
// text in Unicode.
const ZAWGYI = 'ေမာင္ေမာင္ ေနေကာင္းလား';
const UNICODE = 'မောင်မောင် နေကောင်းလား';
// "Mingalaba" in Unicode: converting it as if it were Zawgyi breaks it.
const MINGALABA = 'မင်္ဂလာပါ';
// Zawgyi that grows when converted (8 -> 10 characters with the space):
// text typed right up to a limit is still accepted.
const GROWS = 'မဂၤလာပါ ';
const atLimit = (limit) => GROWS.repeat(Math.floor(limit / GROWS.length)) + 'x'.repeat(limit % GROWS.length);

describe('toUnicode (Day 43)', () => {
  // The paired corpora that ship with myanmar-tools.
  const corpus = (file) =>
    fs.readFileSync(path.join(path.dirname(require.resolve('myanmar-tools')), 'resources', file), 'utf8').split('\n');
  const Z = corpus('mmgov_zawgyi_src.txt');
  const U = corpus('mmgov_unicode_out.txt');

  it('converts Zawgyi text, line by line and as a whole', () => {
    expect(toUnicode(ZAWGYI)).toBe(UNICODE);
    expect(toUnicode('မဂၤလာပါ')).toBe(MINGALABA);
    const lines = Z.map((z, i) => [z, U[i]]).filter(([z]) => z.trim());
    expect(lines.length).toBeGreaterThan(50);
    for (const [z, u] of lines) expect(toUnicode(z)).toBe(u);
    expect(toUnicode(Z.join('\n'))).toBe(U.join('\n'));
  });

  it('never changes Unicode Myanmar text', () => {
    expect(toUnicode(MINGALABA)).toBe(MINGALABA);
    expect(toUnicode(UNICODE)).toBe(UNICODE);
    expect(toUnicode(U.join('\n'))).toBe(U.join('\n'));
  });

  it('converts only the Zawgyi lines of mixed text', () => {
    expect(toUnicode(`${MINGALABA}\n${ZAWGYI}\nhello`)).toBe(`${MINGALABA}\n${UNICODE}\nhello`);
  });

  it('decides a one-letter line by the rest of the text', () => {
    // "က" alone is ambiguous: kept on its own, converted in a Zawgyi post.
    expect(toUnicode('က')).toBe('က');
    expect(toUnicode(`${ZAWGYI}\nက`)).toBe(`${UNICODE}\nက`);
    // "law" in Zawgyi scores 0.85 on its own: left alone, or next to
    // Unicode text, but converted inside a Zawgyi post.
    expect(toUnicode('ဥပေဒ')).toBe('ဥပေဒ');
    expect(toUnicode(`${MINGALABA}\nဥပေဒ`)).toBe(`${MINGALABA}\nဥပေဒ`);
    expect(toUnicode(`${ZAWGYI}\nဥပေဒ`)).toBe(`${UNICODE}\nဥပဒေ`);
  });

  it('passes everything else through unchanged', () => {
    for (const value of ['', 'plain English #tag @bob', 'مرحبا بالعالم', '😀 🇲🇲', undefined, null, 5, ['x']]) {
      expect(toUnicode(value)).toBe(value);
    }
    expect(toUnicode(`${ZAWGYI}\r\n${ZAWGYI}`)).toBe(`${UNICODE}\r\n${UNICODE}`);
  });

  it('leaves text longer than any field alone (its route refuses it)', () => {
    expect(toUnicode(atLimit(10000))).toBe(`${MINGALABA} `.repeat(1250));
    const tooLong = `${atLimit(10000)}x`;
    expect(toUnicode(tooLong)).toBe(tooLong);
  });
});

describe('Zawgyi is stored as Unicode (Day 43)', () => {
  const { app, reset } = setupTestApp();
  // After setupTestApp, so the service gets the mocked db.
  const messageService = require('../../services/messageService');
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const newPost = (user, content) => request(app).post('/posts').set(auth(user)).field('content', content);

  it('posts: create and edit', async () => {
    const a = await registerAndLogin(app);
    const created = await newPost(a, `${ZAWGYI} #yangon`);
    expect(created.status).toBe(201);
    expect(created.body.content).toBe(`${UNICODE} #yangon`);
    const tags = await pool.query('SELECT h.tag FROM post_hashtags ph JOIN hashtags h ON h.id = ph.hashtag_id WHERE ph.post_id = $1', [created.body.id]);
    expect(tags.rows.map((r) => r.tag)).toEqual(['yangon']);

    const edited = await request(app).put(`/posts/${created.body.id}`).set(auth(a)).send({ content: `${MINGALABA}\n${ZAWGYI}` });
    expect(edited.status).toBe(200);
    expect(edited.body.content).toBe(`${MINGALABA}\n${UNICODE}`);
    expect((await request(app).get(`/posts/${created.body.id}`).set(auth(a))).body.content).toBe(`${MINGALABA}\n${UNICODE}`);
  });

  it('posts: at most 10,000 characters, and content must be text', async () => {
    const a = await registerAndLogin(app);
    expect((await newPost(a, 'x'.repeat(10000))).status).toBe(201);
    const long = await newPost(a, 'x'.repeat(10001));
    expect(long.status).toBe(400);
    expect(long.text).toBe('Post must be 10000 characters or fewer');
    // The limit counts the text as typed, though conversion makes it longer.
    const grown = await newPost(a, atLimit(10000));
    expect(grown.status).toBe(201);
    expect(grown.body.content).toBe(`${MINGALABA} `.repeat(1250));
    const p = (await newPost(a, 'short')).body;
    expect((await request(app).put(`/posts/${p.id}`).set(auth(a)).send({ content: atLimit(10000) })).status).toBe(200);
    expect((await request(app).put(`/posts/${p.id}`).set(auth(a)).send({ content: 'x'.repeat(10001) })).status).toBe(400);
    expect((await request(app).put(`/posts/${p.id}`).set(auth(a)).send({ content: ['x'] })).status).toBe(400);
    expect((await request(app).post('/posts').set(auth(a)).send({ content: { a: 1 } })).status).toBe(400);
  });

  it('comments: create and edit, at most 5,000 characters', async () => {
    const a = await registerAndLogin(app);
    const p = (await newPost(a, 'hello')).body;
    const c = await request(app).post(`/posts/${p.id}/comments`).set(auth(a)).send({ content: ZAWGYI });
    expect(c.status).toBe(201);
    expect(c.body.content).toBe(UNICODE);
    const e = await request(app).put(`/comments/${c.body.id}`).set(auth(a)).send({ content: `ok ${ZAWGYI}` });
    expect(e.body.content).toBe(`ok ${UNICODE}`);

    expect((await request(app).post(`/posts/${p.id}/comments`).set(auth(a)).send({ content: 'x'.repeat(5000) })).status).toBe(201);
    const long = await request(app).post(`/posts/${p.id}/comments`).set(auth(a)).send({ content: 'x'.repeat(5001) });
    expect(long.status).toBe(400);
    expect(long.text).toBe('Comment must be 5000 characters or fewer');
    expect((await request(app).put(`/comments/${c.body.id}`).set(auth(a)).send({ content: 'x'.repeat(5001) })).status).toBe(400);
    expect((await request(app).post(`/posts/${p.id}/comments`).set(auth(a)).send({ content: 42 })).status).toBe(400);
    const grown = await request(app).post(`/posts/${p.id}/comments`).set(auth(a)).send({ content: atLimit(5000) });
    expect(grown.status).toBe(201);
    expect(grown.body.content).toBe(`${MINGALABA} `.repeat(625));
  });

  it('messages: send, edit, image caption, and the socket path', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
    const sent = await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content: ZAWGYI });
    expect(sent.status).toBe(201);
    expect(sent.body.content).toBe(UNICODE);
    const edited = await request(app).put(`/conversations/${conv.id}/messages/${sent.body.id}`).set(auth(a)).send({ content: `${ZAWGYI}!` });
    expect(edited.body.content).toBe(`${UNICODE}!`);

    // The socket's send_message and the image upload call these directly.
    const viaSocket = await messageService.sendMessage({ conversationId: conv.id, senderId: b.id, content: ZAWGYI });
    expect(viaSocket.content).toBe(UNICODE);
    const image = await messageService.sendImageMessage({
      conversationId: conv.id, senderId: b.id, mediaUrl: 'https://res.cloudinary.com/demo/image/upload/v1/messages/a.jpg', caption: ZAWGYI
    });
    expect(image.content).toBe(UNICODE);
    const stored = await pool.query('SELECT content FROM messages WHERE conversation_id = $1 ORDER BY id', [conv.id]);
    expect(stored.rows.map((r) => r.content)).toEqual([`${UNICODE}!`, UNICODE, UNICODE]);

    // Up to the limit as typed (messages are trimmed); over it, refused.
    const grownText = `${MINGALABA} `.repeat(625).trim();
    const grown = await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content: atLimit(5000) });
    expect(grown.status).toBe(201);
    expect(grown.body.content).toBe(grownText);
    const grownEdit = await request(app).put(`/conversations/${conv.id}/messages/${grown.body.id}`).set(auth(a)).send({ content: `${atLimit(5000)}` });
    expect(grownEdit.status).toBe(200);
    expect((await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content: `${atLimit(5000)}x` })).status).toBe(400);
  });

  it('bio, but not the username; bio at most 500 characters', async () => {
    const a = await registerAndLogin(app);
    const put = (fields) => {
      let req = request(app).put('/profile').set(auth(a)).field('username', fields.username ?? a.username).field('email', a.email);
      if (fields.bio !== undefined) req = req.field('bio', fields.bio);
      return req;
    };
    const res = await put({ username: `${a.username}ေက`, bio: ZAWGYI });
    expect(res.status).toBe(200);
    expect(res.body.bio).toBe(UNICODE);
    expect(res.body.username).toBe(`${a.username}ေက`);
    expect((await put({ bio: 'x'.repeat(500) })).status).toBe(200);
    const grown = await put({ bio: atLimit(500) });
    expect(grown.status).toBe(200);
    expect(grown.body.bio).toBe(`${MINGALABA} `.repeat(62) + 'xxxx');
    const long = await put({ bio: 'x'.repeat(501) });
    expect(long.status).toBe(400);
    expect(long.text).toBe('Bio must be 500 characters or fewer');
    // Leaving the bio out still clears it, as before.
    expect((await put({})).body.bio).toBeNull();
    const notText = await request(app).put('/profile').set(auth(a)).send({ username: a.username, email: a.email, bio: 5 });
    expect(notText.status).toBe(400);
    expect(notText.text).toBe('Invalid bio');
  });

  it('group chat, community and page names and descriptions', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const group = await request(app).post('/conversations/groups').set(auth(a)).send({ name: ZAWGYI, userIds: [b.id] });
    expect(group.status).toBe(201);
    const renamed = await request(app).patch(`/conversations/${group.body.id}`).set(auth(a)).send({ name: `${ZAWGYI} 2` });
    expect(renamed.status).toBe(200);
    expect((await pool.query('SELECT name FROM conversations WHERE id = $1', [group.body.id])).rows[0].name).toBe(`${UNICODE} 2`);

    const community = await request(app).post('/communities').set(auth(a)).send({ name: ZAWGYI, description: ZAWGYI });
    expect(community.status).toBe(201);
    await request(app).patch(`/communities/${community.body.id}`).set(auth(a)).send({ description: `${ZAWGYI}.` });
    const c = (await pool.query('SELECT name, description FROM communities WHERE id = $1', [community.body.id])).rows[0];
    expect(c).toEqual({ name: UNICODE, description: `${UNICODE}.` });

    const page = await request(app).post('/pages').set(auth(a)).send({ name: ZAWGYI, description: ZAWGYI });
    expect(page.status).toBe(201);
    await request(app).patch(`/pages/${page.body.id}`).set(auth(a)).send({ name: `${ZAWGYI}.` });
    const p = (await pool.query('SELECT name, description FROM pages WHERE id = $1', [page.body.id])).rows[0];
    expect(p).toEqual({ name: `${UNICODE}.`, description: UNICODE });
  });

  it('report details', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const p = (await newPost(b, 'hello')).body;
    const r = await request(app).post('/reports').set(auth(a)).send({ targetType: 'post', targetId: p.id, reason: 'other', details: ZAWGYI });
    expect(r.status).toBe(201);
    expect((await pool.query('SELECT details FROM reports WHERE reporter_id = $1', [a.id])).rows[0].details).toBe(UNICODE);
  });

  describe('search queries', () => {
    const search = (user, type, q) => request(app).get(`/search/${type}`).query({ q }).set(auth(user));

    it('posts: a Zawgyi query finds the (Unicode) post, as does a Unicode one', async () => {
      const a = await registerAndLogin(app);
      const post = (await request(app).post('/posts').set(auth(a)).field('content', `${ZAWGYI} today`)).body;
      for (const q of [ZAWGYI, UNICODE, 'ေမာင္ေမာင္']) {
        const res = await search(a, 'posts', q);
        expect(res.status).toBe(200);
        expect(res.body.posts.map((p) => p.id)).toEqual([post.id]);
      }
    });

    it('people: names are kept as typed, so a query matches either way', async () => {
      // One name typed in Unicode, one in Zawgyi (usernames are never converted).
      const unicodeName = await registerAndLogin(app, { username: 'မောင်မောင်' });
      const longer = await registerAndLogin(app, { username: 'မောင်မောင်ကြီး' });
      const zawgyiName = await registerAndLogin(app, { username: 'ေမာင္ေမာင္ေလး' });
      // Contains the name but doesn't start with it (and is shorter than `longer`).
      const contains = await registerAndLogin(app, { username: 'ကိုမောင်မောင်' });
      const me = await registerAndLogin(app);
      const ids = async (q) => (await search(me, 'users', q)).body.map((u) => u.id);
      // Zawgyi query: the Unicode names (converted) and the Zawgyi one (as
      // typed); the exact name, then names starting with it, then the rest.
      expect(await ids('ေမာင္ေမာင္')).toEqual([unicodeName.id, zawgyiName.id, longer.id, contains.id]);
      // Unicode query: the Unicode names only.
      expect(await ids('မောင်မောင်')).toEqual([unicodeName.id, longer.id, contains.id]);
      expect(await ids('plainname_nobody')).toEqual([]);
    });

    it('hashtags: a Zawgyi query is converted', async () => {
      const a = await registerAndLogin(app);
      await request(app).post('/posts').set(auth(a)).field('content', 'hello #yangon');
      expect((await search(a, 'hashtags', '#yangon')).body.map((t) => t.tag)).toEqual(['yangon']);
      expect((await search(a, 'hashtags', ZAWGYI)).status).toBe(200);
    });

    it('groups and pages: a Zawgyi query finds a Unicode name', async () => {
      const a = await registerAndLogin(app);
      const community = (await request(app).post('/communities').set(auth(a)).send({ name: `${UNICODE} club` })).body;
      const page = (await request(app).post('/pages').set(auth(a)).send({ name: `${UNICODE} shop` })).body;
      const groups = (await request(app).get('/communities').query({ q: ZAWGYI }).set(auth(a))).body;
      expect([...groups.mine, ...groups.discover].map((c) => c.id)).toEqual([community.id]);
      const pages = (await request(app).get('/pages').query({ q: ZAWGYI }).set(auth(a))).body;
      expect([...pages.owned, ...pages.following, ...pages.discover].map((p) => p.id)).toEqual([page.id]);
    });

    it('recent searches are kept in Unicode: Zawgyi and Unicode are one entry', async () => {
      const a = await registerAndLogin(app);
      const save = (query) => request(app).post('/search/history').set(auth(a)).send({ query });
      expect((await save(ZAWGYI)).status).toBe(204);
      expect((await save('hello')).status).toBe(204);
      expect((await save(UNICODE)).status).toBe(204);
      const history = (await request(app).get('/search/history').set(auth(a))).body;
      expect(history.map((s) => s.query)).toEqual([UNICODE, 'hello']);
    });
  });
});
