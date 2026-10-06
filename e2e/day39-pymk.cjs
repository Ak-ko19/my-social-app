// Day 39: hiding a "People you may know" suggestion (headless Edge,
// throwaway stack: alice(1), bob(2); carol and dave are signed up here).
// Alice follows bob, who follows carol and dave -> both are suggested to
// alice. She hides carol with the card's X: gone at once and after a
// reload; dave stays; nothing changed between alice and carol. Dark and
// Arabic (RTL): the X sits on the card's end corner.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  const users = {
    alice: { id: 1, token: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim() },
    bob: { id: 2, token: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() }
  };
  for (const name of ['carol', 'dave']) {
    const creds = { username: name, email: `${name}@example.com`, password: 'a-fine-password-123' };
    await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
    const login = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: creds.email, password: creds.password }) }).then((r) => r.json());
    users[name] = { id: login.id, token: login.token };
  }
  const follow = (a, b) => fetch(`${API}/users/${users[b].id}/follow`, { method: 'POST', headers: { Authorization: `Bearer ${users[a].token}` } });
  await follow('alice', 'bob');
  await follow('bob', 'carol');
  await follow('bob', 'dave');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (url, { theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [users.alice.token, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const card = (page, name) => page.locator('.pymk-card', { hasText: name });

  const p = await open('/explore');
  await card(p, 'carol').waitFor({ timeout: 10000 }).catch(() => {});
  check('carol and dave are suggested ("Followed by bob")', (await card(p, 'carol').count()) === 1 && (await card(p, 'dave').count()) === 1);
  await p.getByRole('button', { name: 'Hide carol from suggestions' }).click();
  check('hiding carol removes her card at once', (await card(p, 'carol').count()) === 0 && (await card(p, 'dave').count()) === 1);
  await p.waitForTimeout(400);
  await p.reload({ waitUntil: 'networkidle' });
  await card(p, 'dave').waitFor({ timeout: 10000 }).catch(() => {});
  check('...and she stays hidden after a reload', (await card(p, 'carol').count()) === 0 && (await card(p, 'dave').count()) === 1);
  const carolProfile = await fetch(`${API}/profile/${users.carol.id}`, { headers: { Authorization: `Bearer ${users.alice.token}` } }).then((r) => r.json());
  check('nothing else changed: carol\'s profile still opens for alice, no block', carolProfile.username === 'carol' && carolProfile.is_blocked_by_me === false);

  // Keyboard: the X is reachable and labelled.
  const x = p.getByRole('button', { name: 'Hide dave from suggestions' });
  await x.focus();
  check('the X can be focused by keyboard', (await p.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Hide dave from suggestions');

  // Dark and Arabic.
  for (const [theme, lang] of [['dark', 'en'], ['light', 'ar']]) {
    const q = await open('/explore', { theme, lang });
    await card(q, 'dave').waitFor({ timeout: 10000 }).catch(() => {});
    const cardBox = await card(q, 'dave').boundingBox();
    const xBox = await card(q, 'dave').locator('.pymk-hide').boundingBox();
    const endCorner = lang === 'ar' ? xBox.x - cardBox.x < 12 : (cardBox.x + cardBox.width) - (xBox.x + xBox.width) < 12;
    check(`${theme}/${lang}: the X sits in the card's end corner`, cardBox && xBox && endCorner && xBox.y - cardBox.y < 12, JSON.stringify({ cardBox, xBox }));
    await q.screenshot({ path: path.join(SP, `day39-pymk-${theme}-${lang}.png`) });
    await q.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
