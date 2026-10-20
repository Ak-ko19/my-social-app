// Day 53: page admins (headless Edge, throwaway stack: alice(1), bob(2)).
// Alice owns a page and adds bob as an admin in Edit page > Admins. Bob
// can now edit the page and post as it (the post is the page's, under
// alice), and delete its posts; he can't delete the page. Alice removes
// him and he's back to a follower's view. Arabic (RTL) + dark at 375px.
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
const api = (who, method, url, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${tokens[who]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined
});

(async () => {
  const page = await (await api('alice', 'POST', '/pages', { name: 'Corner Cafe', category: 'business' })).json();

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const tab = await ctx.newPage();
    tab.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    tab.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
    await tab.goto(WEB + url, { waitUntil: 'networkidle' });
    return tab;
  };
  const axe = async (tab, label, selector = '.screen-enter') => {
    await tab.waitForTimeout(400);
    await tab.evaluate(AXE);
    const r = await tab.evaluate((sel) => window.axe.run(document.querySelector(sel) || document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }), selector);
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };

  // 1. Alice adds bob.
  const alice = await open('alice', `/pages/${page.id}/edit`);
  await alice.getByRole('heading', { name: 'Admins' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Edit page > Admins: alice listed as Owner', (await alice.getByText('Owner', { exact: true }).count()) === 1);
  await alice.getByLabel('Add an admin by username').fill('@BOB');
  await alice.getByRole('button', { name: 'Add', exact: true }).click();
  await alice.getByText('bob is now an admin.').waitFor({ timeout: 8000 }).catch(() => {});
  check('...adds bob by username', (await alice.getByRole('button', { name: 'Remove bob as an admin' }).count()) === 1);
  await axe(alice, 'en/light, Edit page with Admins');

  // 2. Bob runs the page now -- and is told (step 3).
  const bob = await open('bob', '/notifications');
  const told = bob.getByText('Corner Cafe', { exact: true });
  await told.first().waitFor({ timeout: 8000 }).catch(() => {});
  check('bob is told "alice made you an admin of Corner Cafe"', (await told.first().locator('..').innerText().catch(() => '')).includes('alice made you an admin of Corner Cafe'));
  await axe(bob, 'en/light, Notifications with a page notification');
  await bob.getByRole('button', { name: 'Open page Corner Cafe' }).click();
  await bob.waitForURL(`${WEB}/pages/${page.id}`, { timeout: 8000 }).catch(() => {});
  await bob.getByRole('button', { name: 'Post as page' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('bob sees Post as page and Edit page', (await bob.getByRole('button', { name: 'Post as page' }).count()) === 1
    && (await bob.getByRole('button', { name: 'Edit page' }).count()) === 1);
  await bob.getByRole('button', { name: 'Post as page' }).click();
  await bob.getByRole('textbox', { name: 'Post' }).fill('Fresh croissants at 8');
  await bob.getByRole('button', { name: 'Post', exact: true }).click();
  await bob.waitForURL(`${WEB}/pages/${page.id}`, { timeout: 10000 }).catch(() => {});
  const card = bob.locator('article.post-card', { hasText: 'Fresh croissants at 8' });
  await card.waitFor({ timeout: 8000 }).catch(() => {});
  check('...posts as the page: it shows as Corner Cafe, stored under the owner', (await card.locator('.post-card-author').innerText().catch(() => '')) === 'Corner Cafe'
    && sql(`SELECT user_id FROM posts WHERE page_id = ${page.id}`) === '1');
  await card.getByRole('button', { name: 'More options' }).click();
  check('...and gets the post\'s Edit and Delete', (await bob.getByRole('menuitem', { name: 'Edit post' }).count()) === 1
    && (await bob.getByRole('menuitem', { name: 'Delete post' }).count()) === 1);
  await bob.keyboard.press('Escape');
  await bob.getByRole('button', { name: 'Edit page' }).click();
  await bob.getByRole('heading', { name: 'Admins' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Edit page for an admin: no Delete page, no adding admins, a Leave button',
    (await bob.getByRole('button', { name: 'Delete page' }).count()) === 0 && (await bob.getByLabel('Add an admin by username').count()) === 0
    && (await bob.getByRole('button', { name: 'Leave' }).count()) === 1);
  // Step 2: Pages lists it under "Your pages", with no Follow button.
  await bob.goto(`${WEB}/pages`, { waitUntil: 'networkidle' });
  await bob.getByRole('heading', { name: 'Your pages' }).waitFor({ timeout: 8000 }).catch(() => {});
  const yours = bob.locator('ul.group-list').first();
  check('Pages: Corner Cafe under "Your pages" for its admin, no Follow', (await bob.getByRole('heading', { name: 'Your pages' }).count()) === 1
    && (await yours.getByText('Corner Cafe').count()) === 1 && (await bob.getByRole('button', { name: 'Follow Corner Cafe' }).count()) === 0);
  await bob.context().close();

  // 3. Alice removes him.
  await alice.getByRole('button', { name: 'Remove bob as an admin' }).click();
  await alice.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await alice.getByText('bob is no longer an admin.').waitFor({ timeout: 8000 }).catch(() => {});
  check('Remove asks first, then he is gone from the list', sql(`SELECT COUNT(*) FROM page_admins WHERE page_id = ${page.id}`) === '0');
  await alice.context().close();
  const after = await open('bob', `/pages/${page.id}`);
  await after.getByRole('button', { name: /Follow/ }).first().waitFor({ timeout: 8000 }).catch(() => {});
  check('bob is back to a visitor: Follow, no Post as page', (await after.getByRole('button', { name: 'Post as page' }).count()) === 0
    && (await after.getByRole('button', { name: 'Follow' }).count()) === 1);
  await after.context().close();

  // 4. Arabic, dark, 375px.
  await api('alice', 'POST', `/pages/${page.id}/admins`, { username: 'bob' });
  const ar = await open('alice', `/pages/${page.id}/edit`, { lang: 'ar', theme: 'dark', width: 375 });
  await ar.getByRole('heading', { name: AR.pages.admins.title }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: Admins in Arabic, right to left, no sideways scroll', (await ar.getByText(AR.pages.admins.owner, { exact: true }).count()) === 1
    && (await ar.evaluate(() => document.documentElement.dir)) === 'rtl'
    && (await ar.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await axe(ar, 'ar/dark, Edit page with Admins');
  await ar.getByRole('heading', { name: AR.pages.admins.title }).scrollIntoViewIfNeeded();
  await ar.screenshot({ path: path.join(SP, 'day53-admins-ar-dark-375.png') });
  await ar.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
