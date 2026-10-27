// Day 49: spam checks in the app (headless Edge, a throwaway stack with
// SPAM_CHECKS_IN_TESTS=1: alice(1), bob(2), bob's post). Posting the same
// text twice, or the same comment twice on a post, tells you why in the
// composer / comment form and keeps your text; a link shared too often is
// refused in Arabic (RTL, dark, 375px, axe). Nothing is saved twice.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const AR = JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'ar.json'), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
const newPost = (who, content) => {
  const form = new FormData();
  form.append('content', content);
  return fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[who]}` }, body: form });
};
// The refused requests themselves (a 429 in the console) are expected here.
const EXPECTED = /status of 429|status code 429|AxiosError/;

(async () => {
  // Day 102: accounts past their first day (new ones have tighter limits:
  // day102-new-accounts).
  sql("UPDATE users SET created_at = now() - interval '2 days' WHERE id IN (1, 2)");
  const bobPost = await (await newPost('bob', 'Our street party is on Saturday')).json();

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED.test(m.text())) errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const axe = async (page, label) => {
    await page.waitForTimeout(400);
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document.querySelector('.screen-enter') || document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }));
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };
  const publish = async (page, text) => {
    await page.goto(`${WEB}/create-post`, { waitUntil: 'networkidle' });
    await page.getByRole('textbox', { name: 'Post' }).fill(text);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
  };

  // 1. The same post twice.
  const alice = await open('alice', '/');
  await publish(alice, 'Who is coming to the street party?');
  await alice.waitForURL((url) => !url.pathname.startsWith('/create-post'), { timeout: 10000 }).catch(() => {});
  check('a first post goes through', sql("SELECT COUNT(*) FROM posts WHERE user_id = 1 AND content = 'Who is coming to the street party?'") === '1');
  await publish(alice, 'who is coming to the  street party?');
  const samePost = alice.getByText('You just posted this. Try writing something new.');
  await samePost.waitFor({ timeout: 8000 }).catch(() => {});
  check('the same text again: the composer says why', (await samePost.count()) === 1);
  check('...keeps her text, and saves nothing', (await alice.getByRole('textbox', { name: 'Post' }).inputValue()) === 'who is coming to the  street party?'
    && sql("SELECT COUNT(*) FROM posts WHERE user_id = 1 AND lower(content) LIKE 'who is coming%'") === '1');
  await axe(alice, 'en/light, composer with the reason');

  // 2. The same comment twice on one post.
  await alice.goto(`${WEB}/posts/${bobPost.id}`, { waitUntil: 'networkidle' });
  await alice.locator('article.post-card').getByRole('button', { name: 'Comment', exact: true }).click();
  const input = alice.locator('input[id^="comment-input-"]');
  await input.fill('Count me in!');
  await alice.getByRole('button', { name: 'Send', exact: true }).click();
  await alice.getByText('Count me in!').waitFor({ timeout: 8000 }).catch(() => {});
  await input.fill('count me in!');
  await alice.getByRole('button', { name: 'Send', exact: true }).click();
  const sameComment = alice.getByText('You already left this comment on this post.');
  await sameComment.waitFor({ timeout: 8000 }).catch(() => {});
  check('the same comment again: the form says why and gives the text back', (await sameComment.count()) === 1
    && (await input.inputValue()) === 'count me in!');
  check('...one comment on the post, not two', sql(`SELECT COUNT(*) FROM comments WHERE post_id = ${bobPost.id} AND user_id = 1`) === '1'
    && (await alice.locator('.feed-comment-list > li').count()) === 1);
  await alice.context().close();

  // 3. A link shared too often, in Arabic.
  for (const n of [1, 2, 3]) await newPost('alice', `Tickets ${n}: https://tickets.example/party`);
  const ar = await open('alice', '/create-post', { lang: 'ar', theme: 'dark', width: 375 });
  await ar.getByRole('textbox').first().fill('آخر فرصة https://www.tickets.example/party/');
  await ar.getByRole('button', { name: AR.compose.post, exact: true }).click();
  const tooOften = ar.getByText('شاركت هذا الرابط مرات كثيرة خلال الساعة الماضية. يرجى المحاولة لاحقًا.');
  await tooOften.waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: the same link a 4th time in an hour: refused, in Arabic', (await tooOften.count()) === 1
    && sql("SELECT COUNT(*) FROM posts WHERE user_id = 1 AND content LIKE '%tickets.example%'") === '3');
  check('ar: right to left, no sideways scroll at 375px', (await ar.evaluate(() => document.documentElement.dir)) === 'rtl'
    && (await ar.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await axe(ar, 'ar/dark, composer with the reason');
  await ar.screenshot({ path: path.join(SP, 'day49-spam-ar-dark-375.png') });
  await ar.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
