// Day 49: Hidden words (headless Edge, throwaway stack: alice(1), bob(2)).
// Alice follows bob. On "warn" (the default) bob's post with a word from
// the built-in list is covered on her Home until "Show anyway"; she adds
// her own word in Settings > Hidden words and his other post is covered
// too. On "hide" both leave Home (the post page covers instead) and his
// matching comment on her post is left out -- for her only: bob sees all
// of it. Arabic (RTL) + dark at 375px with axe.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const AR = JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'ar.json'), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
const api = (who, method, url, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${tokens[who]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined
});
const newPost = async (who, content) => {
  const form = new FormData();
  form.append('content', content);
  return (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[who]}` }, body: form })).json();
};
const COVER = 'This post may contain words you chose to hide.';

(async () => {
  await api('alice', 'POST', '/users/2/follow');
  const rude = await newPost('bob', 'What the fuuuck is this traffic');
  const finale = await newPost('bob', 'That finale was wild');
  await newPost('bob', 'A sunny day at the beach');
  const mine = await newPost('alice', 'My new bike');
  await api('bob', 'POST', `/posts/${mine.id}/comments`, { content: 'Nice, but the finale ruined my week' });
  await api('bob', 'POST', `/posts/${mine.id}/comments`, { content: 'Looks fast' });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const axe = async (page, label) => {
    await page.waitForTimeout(400); // the screen-enter animation
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document.querySelector('.screen-enter') || document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }));
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };
  const card = (page, text) => page.locator('article.post-card', { hasText: text });

  // 1. Warn (the default) with the built-in list.
  const alice = await open('alice', '/');
  await card(alice, 'A sunny day').waitFor({ timeout: 10000 }).catch(() => {});
  const covered = alice.locator('article.post-card', { hasText: COVER });
  check('warn by default: the built-in list covers one of bob\'s posts', (await covered.count()) === 1
    && (await alice.getByText('What the fuuuck', { exact: false }).count()) === 0);
  check('...his clean posts show as they are', (await card(alice, 'A sunny day at the beach').count()) === 1
    && (await card(alice, 'That finale was wild').count()) === 1);
  check('...the author stays visible on the covered post', (await covered.locator('.post-card-author').innerText()) === 'bob');
  await axe(alice, 'en/light, Home with a covered post');
  await covered.getByRole('button', { name: 'Show anyway' }).click();
  check('Show anyway uncovers that post', (await alice.getByText('What the fuuuck is this traffic').count()) === 1);

  // 2. Settings > Hidden words: add your own word.
  await alice.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: /Hidden words/ }).click();
  await alice.waitForURL(`${WEB}/settings/hidden-words`, { timeout: 8000 }).catch(() => {});
  await alice.getByRole('radio', { name: /Cover them/ }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Settings > Hidden words: "Cover them" is chosen', await alice.getByRole('radio', { name: /Cover them/ }).isChecked());
  await alice.getByLabel('Add a word or phrase to hide').fill('Finale');
  await alice.getByRole('button', { name: 'Add', exact: true }).click();
  await alice.getByRole('button', { name: 'Remove “finale”' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('...her word is added (one form, lower case)', (await alice.getByRole('button', { name: 'Remove “finale”' }).count()) === 1);
  await axe(alice, 'en/light, Hidden words');
  await alice.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await card(alice, 'A sunny day').waitFor({ timeout: 10000 }).catch(() => {});
  check('...and the post with it is covered on Home', (await alice.locator('article.post-card', { hasText: COVER }).count()) === 2
    && (await alice.getByText('That finale was wild').count()) === 0);

  // 3. Hide.
  await alice.goto(`${WEB}/settings/hidden-words`, { waitUntil: 'networkidle' });
  await alice.getByRole('radio', { name: /Hide them/ }).check();
  await alice.getByText('Saved.').waitFor({ timeout: 8000 }).catch(() => {});
  await alice.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await card(alice, 'A sunny day').waitFor({ timeout: 10000 }).catch(() => {});
  check('hide: both posts leave Home, not covered; his clean ones stay', (await card(alice, 'fuuuck').count()) === 0
    && (await card(alice, 'finale').count()) === 0 && (await alice.getByText(COVER).count()) === 0
    && (await card(alice, 'A sunny day at the beach').count()) === 1);
  await alice.goto(`${WEB}/posts/${finale.id}`, { waitUntil: 'networkidle' });
  await alice.getByText(COVER).waitFor({ timeout: 8000 }).catch(() => {});
  check('...the post page covers it instead', (await alice.getByText(COVER).count()) === 1);
  await alice.goto(`${WEB}/posts/${mine.id}`, { waitUntil: 'networkidle' });
  await card(alice, 'My new bike').getByRole('button', { name: 'Comment', exact: true }).click();
  await alice.getByText('Looks fast').waitFor({ timeout: 8000 }).catch(() => {});
  check("...bob's matching comment on her post is left out, the other stays", (await alice.getByText('Looks fast').count()) === 1
    && (await alice.getByText(/finale ruined/).count()) === 0);
  await alice.context().close();

  // 4. Only for her.
  const bob = await open('bob', `/posts/${mine.id}`);
  await card(bob, 'My new bike').getByRole('button', { name: 'Comment', exact: true }).click();
  await bob.getByText('Looks fast').waitFor({ timeout: 8000 }).catch(() => {});
  check('bob still sees his comments, and was never told', (await bob.getByText(/finale ruined/).count()) === 1);
  await bob.goto(`${WEB}/posts/${rude.id}`, { waitUntil: 'networkidle' });
  check('...and his own post, uncovered', (await bob.getByText('What the fuuuck is this traffic').count()) === 1);
  await bob.context().close();

  // 5. Arabic, dark, 375px: the screen, and an Arabic built-in word covered.
  await api('alice', 'PUT', '/hidden-words/mode', { mode: 'warn' });
  await newPost('bob', 'يا شرموووطة');
  const ar = await open('alice', '/settings/hidden-words', { lang: 'ar', theme: 'dark', width: 375 });
  await ar.getByRole('radio', { name: new RegExp(AR.hiddenWords.mode.warn) }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: the screen in Arabic, right to left', (await ar.getByRole('radio', { name: new RegExp(AR.hiddenWords.mode.warn) }).isChecked())
    && (await ar.evaluate(() => document.documentElement.dir)) === 'rtl');
  check('ar: no sideways scroll at 375px', await ar.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await axe(ar, 'ar/dark, Hidden words');
  await ar.screenshot({ path: path.join(SP, 'day49-hidden-words-ar-dark-375.png') });
  await ar.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await ar.getByText(AR.hiddenWords.coverPost).first().waitFor({ timeout: 10000 }).catch(() => {});
  check('ar: an Arabic word from the built-in list is covered, stretched or not', (await ar.getByText('شرموووطة').count()) === 0
    && (await ar.getByText(AR.hiddenWords.coverPost).count()) === 3);
  await axe(ar, 'ar/dark, Home with covered posts');
  await ar.screenshot({ path: path.join(SP, 'day49-home-ar-dark-375.png') });
  await ar.goto(`${WEB}/posts/${mine.id}`, { waitUntil: 'networkidle' });
  await card(ar, 'My new bike').locator('.post-card-actions button').nth(1).click();
  await ar.getByText(AR.hiddenWords.coverComment).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar, warn: her word covers bob\'s comment; the other shows', (await ar.getByText(AR.hiddenWords.coverComment).count()) === 1
    && (await ar.getByText('Looks fast').count()) === 1 && (await ar.getByText(/finale ruined/).count()) === 0);
  await axe(ar, 'ar/dark, a covered comment');
  await ar.getByRole('button', { name: AR.hiddenWords.show }).click();
  check('...and shows on request', (await ar.getByText(/finale ruined/).count()) === 1);
  await ar.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
