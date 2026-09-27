// B5 per-post audience in headless Edge (throwaway stack: alice(1)
// follows bob(2); bob does NOT follow alice).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const results = [];
const errors = [];
// Set while a step deliberately visits a hidden post: its 404 is expected.
let expect404 = false;
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const get = (url, token) => fetch(API + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async (token, id, name, { width = 390, theme = 'light' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, i, n, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', i);
      localStorage.setItem('username', n); localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th);
    }, [token, String(id), name, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (expect404 && /404|status code 404/.test(m.text())) return;
      errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };

  // Alice creates a followers-only post via the UI (keyboard-selecting the audience).
  const alice = await newPage(aliceToken, 1, 'alice');
  await alice.goto('http://localhost:5173/create-post', { waitUntil: 'networkidle' });
  check('audience defaults to Public', await alice.getByRole('radio', { name: 'Public' }).isChecked());
  await alice.locator('textarea').fill('alice-secret followers only');
  await alice.getByRole('radio', { name: 'Public' }).focus();
  await alice.keyboard.press('ArrowRight');
  check('arrow key moves the selection to Followers', await alice.getByRole('radio', { name: 'Followers' }).isChecked());
  await alice.screenshot({ path: path.join(SP, 'b5-create-audience.png') });
  await alice.getByRole('button', { name: /^post$/i }).click();
  await alice.waitForURL('http://localhost:5173/');

  const mine = (await (await get('/posts', aliceToken)).json()).posts.find((p) => p.content.startsWith('alice-secret'));
  check('server stored visibility=followers', mine && mine.visibility === 'followers', mine && mine.visibility);

  // Bob (not a follower) can't reach it.
  check('bob: post detail 404', (await get(`/posts/${mine.id}`, bobToken)).status === 404);
  const bobSearch = await (await get('/search/posts?q=alice-secret', bobToken)).json();
  check('bob: not in search', bobSearch.posts.length === 0);
  const bob = await newPage(bobToken, 2, 'bob');
  expect404 = true;
  await bob.goto(`http://localhost:5173/posts/${mine.id}`, { waitUntil: 'networkidle' });
  expect404 = false;
  check('bob: detail screen says Post not found', /Post not found/.test(await bob.locator('body').innerText()));

  // Alice sees the Followers icon on her own post, then makes it public from the menu.
  await alice.goto(`http://localhost:5173/posts/${mine.id}`, { waitUntil: 'networkidle' });
  check('alice sees "Followers only" audience on her post', (await alice.locator('.post-card-audience').getAttribute('title')) === 'Followers only');
  await alice.getByRole('button', { name: 'More options' }).click();
  await alice.getByRole('menuitem', { name: 'Make public' }).click();
  await alice.waitForTimeout(700);
  check('menu toggle -> icon shows Public', (await alice.locator('.post-card-audience').getAttribute('title')) === 'Public');
  check('server: now public, bob can open it', (await get(`/posts/${mine.id}`, bobToken)).status === 200);
  await bob.reload({ waitUntil: 'networkidle' });
  check('bob: detail screen now shows the post', /alice-secret/.test(await bob.locator('body').innerText()));

  // And back to followers-only; the menu label flips.
  await alice.getByRole('button', { name: 'More options' }).click();
  check('menu offers the opposite action', (await alice.getByRole('menuitem', { name: 'Make visible to followers only' }).count()) === 1);
  await alice.getByRole('menuitem', { name: 'Make visible to followers only' }).click();
  await alice.waitForTimeout(700);
  check('server: followers-only again', (await get(`/posts/${mine.id}`, bobToken)).status === 404);

  // A follower (bob follows alice) sees it.
  await fetch(`${API}/users/1/follow`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}` } });
  check('once bob follows alice he can see it', (await get(`/posts/${mine.id}`, bobToken)).status === 200);

  // Dark 375 create screen fits.
  const small = await newPage(aliceToken, 1, 'alice', { width: 375, theme: 'dark' });
  await small.goto('http://localhost:5173/create-post', { waitUntil: 'networkidle' });
  const hScroll = await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('375px dark create screen: no horizontal scroll', !hScroll);
  await small.screenshot({ path: path.join(SP, 'b5-create-dark-375.png') });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
