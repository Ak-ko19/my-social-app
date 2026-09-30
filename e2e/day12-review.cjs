// Day 12 step 2: the admin report review -- removing a reported comment and
// message, and suspending an account for a while. Throwaway stack: alice(1)
// is made admin via SQL, bob(2) reports; erin and dave misbehave.
// EN/MY/AR (RTL), light/dark, 375-430px.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const { PSQL } = require('./pg.cjs');
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const fill = (text, values) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k]);
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const call = async (method, url, token, body) => {
  const res = await fetch(API + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, json, text };
};
const signup = async (name) => {
  await call('POST', '/signup', null, { username: name, email: `${name}@example.com`, password: 'a-fine-password-123' });
  return (await call('POST', '/login', null, { email: `${name}@example.com`, password: 'a-fine-password-123' })).json;
};

(async () => {
  sql('UPDATE users SET is_admin = true WHERE id = 1');
  const erin = await signup('erin');
  const dave = await signup('dave');
  const rude = (await call('POST', '/posts/1/comments', erin.token, { content: 'nobody likes you' })).json;
  const conv = (await call('POST', '/conversations', erin.token, { userId: 2 })).json;
  const threat = (await call('POST', `/conversations/${conv.id}/messages`, erin.token, { content: 'watch your back' })).json;
  await call('POST', '/reports', bobToken, { targetType: 'comment', targetId: rude.id, reason: 'harassment' });
  await call('POST', '/reports', bobToken, { targetType: 'message', targetId: threat.id, reason: 'harassment' });
  await call('POST', '/reports', bobToken, { targetType: 'user', targetId: dave.id, reason: 'spam' });
  check('setup: 3 reports filed', (await call('GET', '/admin/reports', aliceToken)).json?.reports?.length === 3);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async (token, id, name, { lang = 'en', theme = 'light', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, i, n, l, th]) => {
      if (t) { localStorage.setItem('token', t); localStorage.setItem('userId', i); localStorage.setItem('username', n); localStorage.setItem('emailVerified', 'true'); }
      localStorage.setItem('lang', l); localStorage.setItem('theme', th);
    }, [token, String(id), name, lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      // The suspended login attempt is a deliberate 403.
      if (m.type() === 'error' && !(name === 'dave' && /status of 403|AxiosError/.test(m.text()))) errors.push(`${name}/${lang}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`${name}/${lang}: ${e.message}`));
    return page;
  };
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const L = locale('en');

  // Bob keeps his chat with erin open: a removed message must vanish live.
  const bob = await newPage(bobToken, 2, 'bob');
  await bob.goto(`${WEB}/messages/${conv.id}`, { waitUntil: 'networkidle' });
  await bob.getByText('watch your back').waitFor({ timeout: 8000 }).catch(() => {});

  const admin = await newPage(aliceToken, 1, 'alice', { width: 375 });
  await admin.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
  await admin.locator('.admin-report').first().waitFor({ timeout: 8000 }).catch(() => {});
  const card = (text) => admin.locator('.admin-report', { hasText: text });

  // 1. Remove the comment.
  check('comment card offers "Remove comment"', (await card('nobody likes you').getByRole('button', { name: L.admin.removeComment }).count()) === 1);
  await card('nobody likes you').getByRole('button', { name: L.admin.removeComment }).click();
  await card('nobody likes you').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  const comments = (await call('GET', '/posts/1/comments', bobToken)).json || [];
  check('remove comment -> gone from the post', !comments.some((c) => c.content === 'nobody likes you'));

  // 2. Remove the message: bob's open chat shows it deleted, live.
  await card('watch your back').getByRole('button', { name: L.admin.removeMessage }).click();
  await bob.getByText(L.messages.preview.deleted).waitFor({ timeout: 8000 }).catch(() => {});
  check('remove message -> bob\'s open chat shows it deleted without a reload',
    (await bob.getByText(L.messages.preview.deleted).count()) === 1 && (await bob.getByText('watch your back').count()) === 0);
  await bob.context().close();

  // 3. Suspend dave for 3 days.
  const daveCard = card('dave');
  await daveCard.getByRole('button', { name: fill(L.admin.suspend, { name: 'dave' }) }).click();
  check('suspend form: 1/3/7/30 days, 7 preselected',
    (await daveCard.getByRole('radio').count()) === 4 && (await daveCard.getByRole('radio', { name: fill(L.admin.days_other, { count: 7 }) }).isChecked()));
  await daveCard.getByRole('radio', { name: fill(L.admin.days_other, { count: 3 }) }).check();
  await daveCard.getByLabel(L.admin.suspendReason).fill('spamming');
  await daveCard.getByRole('button', { name: L.admin.confirmSuspend }).click();
  await admin.getByText(L.admin.emptyPending).waitFor({ timeout: 8000 }).catch(() => {});
  check('suspend -> pending queue empty', (await admin.getByText(L.admin.emptyPending).count()) === 1);
  const until = sql('SELECT extract(epoch FROM banned_until - now())::int FROM users WHERE id = ' + dave.id);
  check('server: dave suspended for ~3 days', Math.abs(Number(until) - 3 * 86400) < 120, `${until} s`);

  // Reviewed tab: outcomes, the "Suspended until" tag, and lifting it.
  await admin.getByRole('tab', { name: L.admin.reviewedTab }).click();
  await admin.locator('.admin-report').first().waitFor({ timeout: 8000 }).catch(() => {});
  const reviewedText = await admin.locator('.admin-report-list, main').first().innerText().catch(() => '');
  check('reviewed: "Comment removed by alice", "Message removed by alice", "User suspended by alice"',
    ['Comment removed', 'Message removed', 'User suspended'].every((w) => reviewedText.includes(`${w} by alice`)), reviewedText.slice(0, 200));
  check('reviewed: "Suspended until …" tag', (await admin.getByText(/^Suspended until /).count()) >= 1);
  check('reviewed: no horizontal scroll at 375px', await noHScroll(admin));
  await admin.screenshot({ path: path.join(SP, 'day12-review-reviewed-en.png'), fullPage: true });

  // 4. Dave can't log in meanwhile -- and is told until when (Myanmar UI).
  const M = locale('my');
  const daveLogin = await newPage(null, 0, 'dave', { lang: 'my', theme: 'dark', width: 390 });
  await daveLogin.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await daveLogin.locator('input[type=email]').fill('dave@example.com');
  await daveLogin.locator('input[type=password]').fill('a-fine-password-123');
  await daveLogin.locator('form button[type=submit]').click();
  await daveLogin.locator('.form-error').waitFor({ timeout: 8000 }).catch(() => {});
  const msg = await daveLogin.locator('.form-error').innerText().catch(() => '');
  const [before, after] = M.auth.suspendedUntil.split('{{date}}');
  check('my: suspended login says until when, in Myanmar', msg.startsWith(before) && msg.endsWith(after) && msg.length > before.length + after.length, msg);
  await daveLogin.screenshot({ path: path.join(SP, 'day12-review-login-my.png') });

  // Lift it: dave gets in again.
  await admin.getByRole('button', { name: fill(L.admin.liftSuspension, { name: 'dave' }) }).first().click();
  await admin.waitForTimeout(800);
  check('lift suspension -> dave can log in', (await call('POST', '/login', null, { email: 'dave@example.com', password: 'a-fine-password-123' })).status === 200);
  await daveLogin.context().close();
  await admin.context().close();

  // 5. Arabic, dark, 430px: the suspend form, translated, no sideways scroll.
  await call('POST', '/reports', bobToken, { targetType: 'user', targetId: erin.id, reason: 'harassment' });
  const A = locale('ar');
  const adminAr = await newPage(aliceToken, 1, 'alice', { lang: 'ar', theme: 'dark', width: 430 });
  await adminAr.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
  await adminAr.locator('.admin-report').first().waitFor({ timeout: 8000 }).catch(() => {});
  await adminAr.getByRole('button', { name: fill(A.admin.suspend, { name: 'erin' }) }).click();
  check('ar: suspend form translated (legend + "يوم واحد")',
    (await adminAr.getByText(fill(A.admin.suspendFor, { name: 'erin' })).count()) === 1 && (await adminAr.getByText(A.admin.days_one, { exact: true }).count()) === 1);
  check('ar: html dir rtl', (await adminAr.getAttribute('html', 'dir')) === 'rtl');
  check('ar: no horizontal scroll', await noHScroll(adminAr));
  await adminAr.screenshot({ path: path.join(SP, 'day12-review-suspend-ar.png'), fullPage: true });
  await adminAr.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
