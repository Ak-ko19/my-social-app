// Day 30 (AUDIT_REPORT_2 N1): account-only screens send logged-out
// visitors to Login -- before any request is made -- and Login returns
// them to the page they wanted. Public browsing (a post, profile, page,
// group, hashtag, explore, search, legal, language) stays open.
// Throwaway stack: alice(1), bob(2); seeds group 1 and page 1.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

const GUARDED = ['/menu', '/settings', '/settings/sessions', '/settings/blocked-users', '/settings/follow-requests', '/settings/account',
  '/settings/notifications', '/saved', '/create-post', '/drafts', '/saved/collections/1', '/settings/muted', '/settings/restricted', '/settings/close-friends', '/settings/interactions', '/settings/hidden-words', '/activity', '/edit-profile', '/notifications', '/messages', '/messages/new-group', '/messages/1',
  '/messages/1/info', '/admin', '/groups', '/groups/new', '/groups/1/manage', '/pages', '/pages/new', '/pages/1/edit', '/events', '/events/new', '/events/1/edit'];
const PUBLIC = ['/posts/1', '/profile/2', '/pages/1', '/groups/1', '/hashtag/welcome', '/explore', '/search', '/terms', '/privacy', '/welcome', '/settings/language', '/login', '/signup', '/forgot-password'];

(async () => {
  const json = { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' };
  await fetch(`${API}/communities`, { method: 'POST', headers: json, body: JSON.stringify({ name: 'Yangon Hikers', description: 'Weekend trails', privacy: 'public' }) });
  await fetch(`${API}/pages`, { method: 'POST', headers: json, body: JSON.stringify({ name: 'Mingalar Tea House', category: 'business', description: 'Tea leaf salad' }) });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) errors.push(m.text()); });
    return page;
  };

  // 1. Logged out: every account-only route goes to Login, asking nothing.
  const anon = watch(await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage());
  let refused = 0;
  anon.on('response', (r) => { if (r.status() === 401) refused += 1; });
  const wrong = [];
  for (const route of GUARDED) {
    await anon.goto(WEB + route, { waitUntil: 'networkidle' });
    if (new URL(anon.url()).pathname !== '/login') wrong.push(`${route} -> ${new URL(anon.url()).pathname}`);
  }
  check(`all ${GUARDED.length} account-only routes go to Login when logged out`, wrong.length === 0, wrong.join(', '));
  check('...without a single refused (401) API call', refused === 0, `${refused}`);

  // 2. Public browsing stays open.
  const moved = [];
  for (const route of PUBLIC) {
    await anon.goto(WEB + route, { waitUntil: 'networkidle' });
    if (new URL(anon.url()).pathname !== route) moved.push(`${route} -> ${new URL(anon.url()).pathname}`);
  }
  check(`all ${PUBLIC.length} public routes stay open when logged out`, moved.length === 0, moved.join(', '));
  await anon.goto(`${WEB}/posts/1`, { waitUntil: 'networkidle' });
  check('a shared post still shows its content to a visitor', (await anon.getByText('Hello from bob').count()) >= 1);

  // 3. Login returns to the page the visitor wanted.
  await anon.goto(`${WEB}/settings/account`, { waitUntil: 'networkidle' });
  await anon.locator('input[type=email]').fill('alice@example.com');
  await anon.locator('input[type=password]').fill('a-fine-password-123');
  await anon.getByRole('button', { name: 'Log in' }).click();
  await anon.waitForURL(`${WEB}/settings/account`, { timeout: 10000 }).catch(() => {});
  await anon.getByRole('heading', { name: 'Account Management' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('after logging in, back on the page they wanted (/settings/account)', new URL(anon.url()).pathname === '/settings/account'
    && (await anon.getByRole('heading', { name: 'Account Management' }).count()) === 1, anon.url());
  await anon.goBack({ waitUntil: 'networkidle' }).catch(() => {});
  check('Back does not return to the login form', new URL(anon.url()).pathname !== '/login', anon.url());

  // 4. Logging in from the login screen itself goes Home; a logged-in
  //    visit to /login goes Home too.
  const fresh = watch(await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage());
  await fresh.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await fresh.locator('input[type=email]').fill('alice@example.com');
  await fresh.locator('input[type=password]').fill('a-fine-password-123');
  await fresh.getByRole('button', { name: 'Log in' }).click();
  await fresh.waitForURL(`${WEB}/`, { timeout: 10000 }).catch(() => {});
  check('logging in from /login goes Home', new URL(fresh.url()).pathname === '/', fresh.url());
  await fresh.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  check('a logged-in visit to /login goes Home', new URL(fresh.url()).pathname === '/', fresh.url());

  // 5. Day 16 note: a session revoked elsewhere, on an account-only screen,
  //    ends on Login (not on a screen re-rendering without a token).
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((t) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
  }, aliceToken);
  const me = watch(await ctx.newPage());
  await me.goto(`${WEB}/settings/sessions`, { waitUntil: 'networkidle' });
  execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -c "UPDATE sessions SET revoked_at = now() WHERE user_id = 1"`);
  await me.reload({ waitUntil: 'networkidle' });
  await me.waitForURL(`${WEB}/login`, { timeout: 10000 }).catch(() => {});
  check('a revoked session on an account-only screen ends on Login', new URL(me.url()).pathname === '/login', me.url());

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
