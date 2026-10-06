// Day 42: search in headless Edge (throwaway stack: alice(1) follows
// bob(2); mya and myanmar_tea are signed up here).
// Ranked search: people (exact name first, Follow button already right),
// posts (the whole phrase, then freshness), Burmese text inside a
// longer word, "%" as a plain character.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const DB = `${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e`;
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  const alice = { id: 1, token: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim() };
  const bob = { id: 2, token: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
  const signup = async (username) => {
    const creds = { username, email: `${username}@example.com`, password: 'a-fine-password-123' };
    await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
    return fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: creds.email, password: creds.password }) }).then((r) => r.json());
  };
  const myanmarTea = await signup('myanmar_tea');
  const mya = await signup('mya');
  const as = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = async (user, content) => {
    const body = new FormData();
    body.append('content', content);
    return fetch(`${API}/posts`, { method: 'POST', headers: as(user), body }).then((r) => r.json());
  };
  const scattered = await post(bob, 'The shop downtown sells good tea');
  await post(bob, 'New tea shop opened downtown');
  const old = await post(mya, 'A tea shop from last spring');
  execSync(`${DB} -qc "UPDATE posts SET created_at = now() - interval '120 days' WHERE id = ${old.id}"`);
  await fetch(`${API}/posts/${scattered.id}/like`, { method: 'POST', headers: as(mya) });
  await post(myanmarTea, 'မင်္ဂလာပါ ရန်ကုန်မြို့ကနေ');
  await post(myanmarTea, '100% sure about this');
  await fetch(`${API}/users/${mya.id}/follow`, { method: 'POST', headers: as(alice) });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((t) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
    localStorage.setItem('emailVerified', 'true');
  }, alice.token);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${WEB}/search`, { waitUntil: 'networkidle' });

  const search = async (q) => {
    await page.getByRole('searchbox', { name: 'Search users or posts' }).fill(q);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('heading', { name: 'Posts' }).waitFor();
    await page.waitForTimeout(200);
  };
  const people = () => page.locator('.card-list').first().locator('.screen-link').allInnerTexts();
  const postTexts = () => page.locator('.search-post-link').allInnerTexts();

  await search('MYA');
  const names = await people();
  check('people: the exact name first, then names starting with it', names[0] === 'mya' && names[1] === 'myanmar_tea', JSON.stringify(names));
  const myaRow = page.locator('.card-row', { has: page.locator('.screen-link', { hasText: /^mya$/ }) });
  check('the Follow button already says Following for someone you follow', (await myaRow.getByRole('button', { name: 'Following' }).count()) === 1);

  await search('tea shop');
  const ranked = await postTexts();
  // Relevance outweighs a few months: both posts with the phrase (newer
  // first) come before the fresher, liked post where the words are apart.
  check('posts: the whole phrase first, newer before older; scattered words after', JSON.stringify(ranked) === JSON.stringify(['New tea shop opened downtown', 'A tea shop from last spring', 'The shop downtown sells good tea']), JSON.stringify(ranked));

  await search('ရန်ကုန်');
  check('Burmese: finds text inside a longer run of letters', JSON.stringify(await postTexts()) === JSON.stringify(['မင်္ဂလာပါ ရန်ကုန်မြို့ကနေ']));

  await search('%');
  check('"%" is a plain character, not "match everything"', JSON.stringify(await postTexts()) === JSON.stringify(['100% sure about this']));

  await page.locator('.search-post-link', { hasText: '100% sure' }).click();
  await page.waitForURL(/\/posts\/\d+$/);
  check('a result opens the post', true);

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
