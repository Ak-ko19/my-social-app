const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 49 step 1: Hidden words (migration 060) -- your mode (off / warn /
// hide, warn until changed) and the words you add. Private to you.
describe('hidden words (Day 49)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const get = (user) => request(app).get('/hidden-words').set(auth(user));
  const add = (user, word) => request(app).post('/hidden-words').set(auth(user)).send({ word });
  const remove = (user, word) => request(app).delete(`/hidden-words/${encodeURIComponent(word)}`).set(auth(user));
  const setMode = (user, mode) => request(app).put('/hidden-words/mode').set(auth(user)).send({ mode });

  it('starts on warn with no words of your own; the mode changes and stays', async () => {
    const me = await registerAndLogin(app);
    expect((await get(me)).body).toEqual({ mode: 'warn', words: [] });
    for (const mode of ['hide', 'off', 'warn']) {
      expect((await setMode(me, mode)).body).toEqual({ mode });
      expect((await get(me)).body.mode).toBe(mode);
    }
    const bad = await setMode(me, 'block');
    expect(bad.status).toBe(400);
    expect((await get(me)).body.mode).toBe('warn');
  });

  it('adds words in one form (any language), newest first; adding twice keeps one; removes', async () => {
    const me = await registerAndLogin(app);
    expect((await add(me, '  Spoiler   ALERT ')).status).toBe(201);
    expect((await add(me, 'حرق')).body.words).toEqual(['حرق', 'spoiler alert']);
    const again = await add(me, 'spoiler alert');
    expect(again.status).toBe(201);
    expect(again.body.words).toHaveLength(2);
    expect((await remove(me, 'Spoiler Alert')).body.words).toEqual(['حرق']);
    expect((await remove(me, 'not there')).status).toBe(200);
  });

  it('rejects empty and too-long words, and a 101st word', async () => {
    const me = await registerAndLogin(app);
    expect((await add(me, '   ')).text).toBe('Enter a word or phrase');
    expect((await add(me, undefined)).status).toBe(400);
    expect((await add(me, 'a'.repeat(41))).text).toBe('A hidden word can be at most 40 characters');
    expect((await add(me, 'ب'.repeat(40))).status).toBe(201);
    await pool.query(
      "INSERT INTO user_hidden_words (user_id, word) SELECT $1, 'w' || g FROM generate_series(1, 99) g",
      [me.id]
    );
    const full = await add(me, 'one more');
    expect(full.status).toBe(400);
    expect(full.text).toBe('You can hide at most 100 words');
    expect((await add(me, 'w5')).status).toBe(201); // one you already have is fine
  });

  it("is yours alone: someone else's list is separate", async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    await add(me, 'secret');
    await setMode(me, 'hide');
    expect((await get(other)).body).toEqual({ mode: 'warn', words: [] });
    await remove(other, 'secret');
    expect((await get(me)).body.words).toEqual(['secret']);
  });

  it('needs a login, and goes into the data export', async () => {
    expect((await request(app).get('/hidden-words')).status).toBe(401);
    const me = await registerAndLogin(app);
    await add(me, 'spoiler');
    await setMode(me, 'hide');
    const data = (await request(app).get('/profile/export').set(auth(me))).body;
    expect(data.settings.hidden_words.mode).toBe('hide');
    expect(data.settings.hidden_words.words.map((w) => w.word)).toEqual(['spoiler']);
  });
});
