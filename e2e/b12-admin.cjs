// B12 admin moderation in headless Edge (throwaway stack; alice(1) made admin via SQL).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const { PSQL } = require('./pg.cjs');
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const results = [];
const errors = [];
let expectedErrors = null; // regex allowed during a step that expects them
// Once dave's ban starts, the server drops his socket; his tab's in-flight
// Socket.io long-poll then gets a 400 ("Session ID unknown") before the
// client reconnects, gets a 401 and logs out. Allowed on his tab only, from
// the ban click on, so it isn't a race with the admin's clicks.
let daveBanStarted = false;
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const call = (method, url, token, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
});
async function signup(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: 'a-fine-password-123' }) });
  return (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, password: 'a-fine-password-123' }) })).json();
}

(async () => {
  sql('UPDATE users SET is_admin = true WHERE id = 1');
  const dave = await signup('dave');
  const carol = await signup('carol');
  const f = new FormData(); f.append('content', 'CLICK HERE for free money');
  const spam = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${dave.token}` }, body: f })).json();
  await call('POST', '/reports', carol.token, { targetType: 'post', targetId: spam.id, reason: 'spam' });
  await call('POST', '/reports', bobToken, { targetType: 'post', targetId: spam.id, reason: 'spam', details: 'obvious scam link' });
  await call('POST', '/reports', carol.token, { targetType: 'user', targetId: dave.id, reason: 'harassment' });

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
      if (expectedErrors && expectedErrors.test(m.text())) return;
      if (name === 'dave' && daveBanStarted && /status of 40[01]\b/.test(m.text())) return;
      errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };

  // Settings row only for admins.
  const admin = await newPage(aliceToken, 1, 'alice');
  await admin.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: /Moderation/ }).waitFor();
  check('admin sees the Moderation row in Settings', true);
  const bob = await newPage(bobToken, 2, 'bob');
  await bob.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' });
  await bob.waitForTimeout(800);
  check('non-admin does not see it', (await bob.getByRole('button', { name: /Moderation/ }).count()) === 0);
  expectedErrors = /404/;
  await bob.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
  await bob.getByText("This page doesn't exist.").waitFor();
  expectedErrors = null;
  check('non-admin opening /admin sees Not found', true);

  // Pending list.
  await admin.getByRole('button', { name: /Moderation/ }).click();
  await admin.waitForURL('http://localhost:5173/admin');
  // Day 61: the admin screen opens on Overview; reports are one tab over.
  await admin.getByRole('tab', { name: 'Reports' }).click();
  await admin.waitForURL('http://localhost:5173/admin?section=reports');
  await admin.locator('.admin-report').first().waitFor();
  check('3 pending reports listed', (await admin.locator('.admin-report').count()) === 3);
  check('duplicate reports on the post are counted ("2 reports")', (await admin.getByText('2 reports').count()) >= 1);

  // Dave's still-open session, to check it gets kicked out after the ban.
  const daveTab = await newPage(dave.token, dave.id, 'dave');
  await daveTab.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // Remove the spam post.
  const postCard = admin.locator('.admin-report', { hasText: 'CLICK HERE' }).first();
  await postCard.getByRole('button', { name: 'Remove post' }).click();
  await admin.waitForTimeout(800);
  check('remove post -> both post reports resolved (1 pending left)', (await admin.locator('.admin-report').count()) === 1);
  check('server: post gone', (await fetch(`${API}/posts/${spam.id}`)).status === 404);

  // Ban dave with a reason.
  daveBanStarted = true;
  await admin.getByRole('button', { name: 'Ban dave' }).click();
  await admin.getByLabel(/Reason for banning dave/).fill('spam account');
  await admin.getByRole('button', { name: 'Confirm ban' }).click();
  await admin.getByText('No pending reports. All clear.').waitFor();
  check('ban -> pending queue empty', true);
  const login = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dave@example.com', password: 'a-fine-password-123' }) });
  check('banned dave cannot log in (403)', login.status === 403);
  expectedErrors = /401|banned/;
  await daveTab.goto('http://localhost:5173/notifications', { waitUntil: 'networkidle' });
  await daveTab.waitForURL(/\/login/, { timeout: 8000 }).catch(() => {});
  expectedErrors = null;
  check('dave\'s already-open session is logged out', /\/login/.test(daveTab.url()), daveTab.url());

  // Reviewed tab + unban.
  await admin.getByRole('tab', { name: 'Reviewed' }).click();
  await admin.locator('.admin-report').first().waitFor();
  const reviewedText = await admin.locator('.admin-report-list').innerText();
  check('Reviewed shows outcomes and who handled them', /Post removed by alice/.test(reviewedText) && /User banned by alice/.test(reviewedText));
  await admin.getByRole('button', { name: 'Unban dave' }).first().click();
  await admin.waitForTimeout(800);
  const relogin = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dave@example.com', password: 'a-fine-password-123' }) });
  check('unban -> dave can log in again', relogin.status === 200);

  const small = await newPage(aliceToken, 1, 'alice', { width: 375, theme: 'dark' });
  await small.goto('http://localhost:5173/admin?section=reports', { waitUntil: 'networkidle' });
  await small.getByRole('tab', { name: 'Reviewed' }).click();
  await small.locator('.admin-report').first().waitFor();
  check('375px dark: no horizontal scroll', !(await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await small.screenshot({ path: path.join(SP, 'b12-admin-dark-375.png') });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
