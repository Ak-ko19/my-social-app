const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 43: scripts/convert-zawgyi.js -- Myanmar text stored before Day 43
// (Zawgyi) is converted to Unicode, and #tags the old ASCII-only parser
// missed get indexed.
const ZAWGYI = 'ေမာင္ေမာင္ ေနေကာင္းလား';
const UNICODE = 'မောင်မောင် နေကောင်းလား';
const Z_YANGON = 'ရန္ကုန္';
const U_YANGON = 'ရန်ကုန်';

describe('convert-zawgyi script', () => {
  const { app, reset } = setupTestApp();
  // After setupTestApp, so the script gets the mocked db.
  const { run, parseArgs, COLUMNS } = require('../../scripts/convert-zawgyi');
  const db = require('../../db');
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const lines = [];
  const log = (line) => lines.push(line);
  const convert = (argv = [], database = db) => {
    lines.length = 0;
    return run({ argv, db: database, log });
  };
  // Writes text straight into the table, as before Day 43 (the API now
  // converts on the way in).
  const setRaw = (table, column, id, text) => pool.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [text, id]);
  const valueOf = async (table, column, id) => (await pool.query(`SELECT ${column} AS v FROM ${table} WHERE id = $1`, [id])).rows[0].v;
  const tagsOf = async (postId) =>
    (await pool.query('SELECT h.tag FROM post_hashtags ph JOIN hashtags h ON h.id = ph.hashtag_id WHERE ph.post_id = $1 ORDER BY h.tag', [postId])).rows.map((r) => r.tag);

  // One old Zawgyi value in every converted column, plus things that must
  // stay as they are. Returns the ids.
  async function seed() {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app, { username: 'ေမာင္ေမာင္' }); // a Zawgyi username
    const post = (await request(app).post('/posts').set(auth(a)).field('content', 'old')).body;
    const unicodePost = (await request(app).post('/posts').set(auth(a)).field('content', `${UNICODE} plain`)).body;
    const comment = (await request(app).post(`/posts/${post.id}/comments`).set(auth(b)).send({ content: 'old' })).body;
    const conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
    const message = (await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content: 'old' })).body;
    const edited = (await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content: 'old' })).body;
    await pool.query("UPDATE messages SET edited_at = '2026-01-01T00:00:00Z' WHERE id = $1", [edited.id]);
    const gone = (await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content: 'old' })).body;
    await pool.query('UPDATE messages SET deleted_at = now() WHERE id = $1', [gone.id]);
    const group = (await request(app).post('/conversations/groups').set(auth(a)).send({ name: 'old', userIds: [b.id] })).body;
    const community = (await request(app).post('/communities').set(auth(a)).send({ name: 'old', description: 'old' })).body;
    const page = (await request(app).post('/pages').set(auth(a)).send({ name: 'old', description: 'old' })).body;
    await request(app).post('/reports').set(auth(b)).send({ targetType: 'post', targetId: post.id, reason: 'other', details: 'old' });
    const report = (await pool.query('SELECT id FROM reports')).rows[0];
    for (const q of ['zawgyi', 'unicode']) await request(app).post('/search/history').set(auth(a)).send({ query: q });
    const history = (await pool.query("SELECT id, query FROM search_history WHERE user_id = $1", [a.id])).rows;
    const zSearch = history.find((h) => h.query === 'zawgyi');
    const uSearch = history.find((h) => h.query === 'unicode');

    await setRaw('posts', 'content', post.id, `${ZAWGYI} #${Z_YANGON}`);
    await setRaw('comments', 'content', comment.id, ZAWGYI);
    await setRaw('messages', 'content', message.id, ZAWGYI);
    await setRaw('messages', 'content', edited.id, ZAWGYI);
    await setRaw('messages', 'content', gone.id, ZAWGYI);
    await setRaw('users', 'bio', a.id, ZAWGYI);
    // A group name that only fits its 100 characters in Zawgyi.
    await setRaw('conversations', 'name', group.id, `${'မဂၤလာပါ '.repeat(12)}xxxx`);
    await setRaw('communities', 'name', community.id, ZAWGYI);
    await setRaw('communities', 'description', community.id, ZAWGYI);
    await setRaw('pages', 'name', page.id, ZAWGYI);
    await setRaw('pages', 'description', page.id, ZAWGYI);
    await setRaw('reports', 'details', report.id, ZAWGYI);
    // The same search saved once in Unicode (a day ago) and again, later,
    // in Zawgyi.
    await pool.query("UPDATE search_history SET query = $1, searched_at = '2026-10-06T10:00:00Z' WHERE id = $2", [U_YANGON, uSearch.id]);
    await pool.query("UPDATE search_history SET query = $1, searched_at = '2026-10-07T10:00:00Z' WHERE id = $2", [Z_YANGON, zSearch.id]);
    // A Unicode Burmese tag the old ASCII-only parser never indexed.
    const oldTags = (await request(app).post('/posts').set(auth(a)).field('content', `${UNICODE} #မြန်မာ`)).body;
    await pool.query('DELETE FROM post_hashtags WHERE post_id = $1', [oldTags.id]);
    return { a, b, post, unicodePost, comment, message, edited, gone, group, community, page, report, zSearch, uSearch, oldTags };
  }

  it('dry run: lists what would change and changes nothing', async () => {
    const s = await seed();
    const before = await pool.query('SELECT content FROM posts ORDER BY id');
    expect(await convert()).toBe(0);
    const out = lines.join('\n');
    expect(out).toMatch(/^posts\.content: 3 with Myanmar text, 1 in Zawgyi \(ids \d+\)$/m);
    expect(out).toMatch(/^messages\.content: 2 with Myanmar text, 2 in Zawgyi/m); // not the deleted one
    expect(out).toMatch(/^search_history\.query: 2 with Myanmar text, 1 in Zawgyi/m);
    expect(out).toMatch(/^conversations\.name: 1 with Myanmar text, none to convert\n {2}1 in Zawgyi left as they are: too long for the column once converted/m);
    expect(out).toMatch(/^posts with hashtags to index: 2/m);
    expect(out).toContain('Dry run: nothing changed. Run again with --apply to convert.');
    expect((await pool.query('SELECT content FROM posts ORDER BY id')).rows).toEqual(before.rows);
    expect(await valueOf('users', 'bio', s.a.id)).toBe(ZAWGYI);
  });

  it('--apply converts every column, indexes tags, and leaves the rest alone', async () => {
    const s = await seed();
    expect(await convert(['--apply'])).toBe(0);
    expect(await valueOf('posts', 'content', s.post.id)).toBe(`${UNICODE} #${U_YANGON}`);
    expect(await valueOf('comments', 'content', s.comment.id)).toBe(UNICODE);
    expect(await valueOf('messages', 'content', s.message.id)).toBe(UNICODE);
    expect(await valueOf('users', 'bio', s.a.id)).toBe(UNICODE);
    expect(await valueOf('communities', 'name', s.community.id)).toBe(UNICODE);
    expect(await valueOf('communities', 'description', s.community.id)).toBe(UNICODE);
    expect(await valueOf('pages', 'name', s.page.id)).toBe(UNICODE);
    expect(await valueOf('pages', 'description', s.page.id)).toBe(UNICODE);
    expect(await valueOf('reports', 'details', s.report.id)).toBe(UNICODE);
    // Left alone: Unicode text, a deleted message, usernames, and a name
    // that would no longer fit.
    expect(await valueOf('posts', 'content', s.unicodePost.id)).toBe(`${UNICODE} plain`);
    expect(await valueOf('messages', 'content', s.gone.id)).toBe(ZAWGYI);
    expect(await valueOf('users', 'username', s.b.id)).toBe('ေမာင္ေမာင္');
    expect(await valueOf('conversations', 'name', s.group.id)).toBe(`${'မဂၤလာပါ '.repeat(12)}xxxx`);
    // Not an edit: no "edited" label appears, an old one is kept.
    expect(await valueOf('messages', 'edited_at', s.message.id)).toBeNull();
    expect((await valueOf('messages', 'edited_at', s.edited.id)).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    // The two recent searches became one; it keeps the newer time.
    const history = (await pool.query('SELECT id, query, searched_at FROM search_history WHERE user_id = $1', [s.a.id])).rows;
    expect(history).toEqual([{ id: s.uSearch.id, query: U_YANGON, searched_at: new Date('2026-10-07T10:00:00Z') }]);
    expect(lines.join('\n')).toMatch(/^search_history\.query: .*merged 1 duplicate searches/m);
    // Tags: the converted post's, and the one the old parser missed.
    expect(await tagsOf(s.post.id)).toEqual([U_YANGON]);
    expect(await tagsOf(s.oldTags.id)).toEqual(['မြန်မာ']);

    // Running it again finds nothing to do.
    expect(await convert(['--apply'])).toBe(0);
    expect(lines.join('\n')).toMatch(/^posts with hashtags to index: none$/m);
    expect(lines.filter((l) => / in Zawgyi \(ids /.test(l))).toEqual([]);
    expect(await convert()).toBe(0);
    expect(lines.at(-1)).toBe('Nothing to convert.');
  });

  it('never overwrites a row edited while it runs', async () => {
    const s = await seed();
    let edited = false;
    const racing = {
      query: async (sql, params) => {
        if (!edited && sql.startsWith('UPDATE comments SET content')) {
          edited = true;
          await pool.query('UPDATE comments SET content = $1 WHERE id = $2', ['edited meanwhile', params[1]]);
        }
        return db.query(sql, params);
      }
    };
    expect(await convert(['--apply'], racing)).toBe(0);
    expect(await valueOf('comments', 'content', s.comment.id)).toBe('edited meanwhile');
    expect(lines.join('\n')).toMatch(/^comments\.content: .*converted 0, 1 skipped \(edited meanwhile\)/m);
  });

  it('covers every column the app converts, and checks its options', async () => {
    expect(COLUMNS.map((c) => `${c.table}.${c.column}`)).toEqual([
      'posts.content', 'comments.content', 'messages.content', 'users.bio', 'conversations.name', 'communities.name',
      'communities.description', 'pages.name', 'pages.description', 'reports.details', 'search_history.query'
    ]);
    expect(parseArgs(['--apply'])).toEqual({ apply: true });
    expect(await convert(['--delete'])).toBe(2);
    expect(lines).toEqual(['Unknown option --delete. Use --apply.']);
  });
});
