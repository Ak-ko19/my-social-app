// Day 33: group admins (headless Edge, throwaway stack: alice(1), bob(2);
// carol is signed up here). Alice (the group's admin) makes bob an admin
// from his Options sheet; bob's open group info updates live and he gets
// the admin controls; alice steps down; bob, now the only admin, has no way
// to step down (a group always keeps one). Dark and Arabic (RTL).
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
  const creds = { username: 'carol', email: 'carol@example.com', password: 'a-fine-password-123' };
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
  const carol = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: creds.email, password: creds.password }) }).then((r) => r.json());
  users.carol = { id: carol.id, token: carol.token };
  const group = await fetch(`${API}/conversations/groups`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${users.alice.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Trail crew', userIds: [users.bob.id, users.carol.id] })
  }).then((r) => r.json());

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, { theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [users[who].token, users[who].id, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
    await page.goto(`${WEB}/messages/${group.id}/info`, { waitUntil: 'networkidle' });
    await page.locator('.group-member-row').nth(2).waitFor({ timeout: 10000 });
    return page;
  };
  const memberRow = (page, name) => page.locator('.group-member-row', { hasText: name });
  const isAdminRow = async (page, name) => (await memberRow(page, name).locator('.group-admin-badge').count()) === 1;

  const alice = await open('alice');
  const bob = await open('bob');
  await bob.waitForTimeout(500);
  check('a member (bob) has no Options buttons at first', (await bob.getByRole('button', { name: /^Options for/ }).count()) === 0);
  check('alice, the only admin, can\'t step down (no Options on her own row)', (await alice.getByRole('button', { name: 'Options for You' }).count()) === 0);

  // 1. Make bob an admin.
  await alice.getByRole('button', { name: 'Options for bob' }).click();
  const sheet = alice.getByRole('dialog', { name: 'bob' });
  check('his Options sheet offers Make admin and Remove', (await sheet.getByRole('menuitem', { name: 'Make admin' }).count()) === 1 && (await sheet.getByRole('menuitem', { name: 'Remove', exact: true }).count()) === 1);
  await sheet.getByRole('menuitem', { name: 'Make admin' }).click();
  await memberRow(alice, 'bob').locator('.group-admin-badge').waitFor({ timeout: 5000 }).catch(() => {});
  check('bob shows as Admin for alice', await isAdminRow(alice, 'bob'));
  await bob.getByRole('button', { name: 'Options for carol' }).waitFor({ timeout: 5000 }).catch(() => {});
  check('bob\'s open screen updates live: he is Admin and has the controls', await isAdminRow(bob, 'You') && (await bob.getByRole('button', { name: 'Options for carol' }).count()) === 1);

  // 2. Alice steps down (another admin exists now).
  await alice.getByRole('button', { name: 'Options for You' }).waitFor({ timeout: 5000 }).catch(() => {});
  await alice.getByRole('button', { name: 'Options for You' }).click();
  await alice.getByRole('menuitem', { name: 'Step down as admin' }).click();
  await alice.waitForTimeout(800);
  check('after stepping down alice is a member: no badge, no controls', !(await isAdminRow(alice, 'You')) && (await alice.getByRole('button', { name: /^Options for/ }).count()) === 0);
  await bob.waitForTimeout(500);
  check('bob, now the only admin, has no step-down option', (await bob.getByRole('button', { name: 'Options for You' }).count()) === 0);
  const refused = await fetch(`${API}/conversations/${group.id}/members/${users.bob.id}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${users.bob.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'member' })
  });
  check('...and the API refuses it too (409)', refused.status === 409);

  // 3. Remove as admin, from another admin.
  await bob.getByRole('button', { name: 'Options for alice' }).click();
  await bob.getByRole('menuitem', { name: 'Make admin' }).click();
  await bob.waitForTimeout(600);
  await bob.getByRole('button', { name: 'Options for alice' }).click();
  check('an admin\'s sheet offers Remove as admin', (await bob.getByRole('menuitem', { name: 'Remove as admin' }).count()) === 1);
  await bob.getByRole('menuitem', { name: 'Remove as admin' }).click();
  await bob.waitForTimeout(600);
  check('Remove as admin works', !(await isAdminRow(bob, 'alice')));

  // 4. Dark and Arabic: the Options sheet fits a phone.
  for (const [theme, lang, label] of [['dark', 'en', 'Options for carol'], ['light', 'ar', 'خيارات carol']]) {
    const p = await open('bob', { theme, lang });
    await p.getByRole('button', { name: label }).click();
    const s = p.locator('.ui-action-sheet');
    await s.waitFor({ timeout: 5000 });
    await p.waitForTimeout(400);
    const box = await s.boundingBox();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}/${lang}: the Options sheet fits the screen`, box && box.x >= 0 && box.x + box.width <= 391 && box.y + box.height <= 845 && !overflow, JSON.stringify(box));
    if (lang === 'ar') check('Arabic page is right-to-left', (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
    await p.screenshot({ path: path.join(SP, `day33-group-admins-${theme}-${lang}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
