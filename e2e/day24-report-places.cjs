// Day 24: reporting groups and pages, and the moderator removing one.
// Throwaway stack: alice(1) is made admin via SQL; bob(2) runs a group and
// a page; carol reports them. EN, AR (RTL).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const fill = (text, values) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k]);
const stripTags = (s) => s.replace(/<\/?link>/g, '');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const call = async (method, url, token, body) => (await fetch(API + url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })).json();

(async () => {
  sql('UPDATE users SET is_admin = true WHERE id = 1');
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'carol', email: 'carol@example.com', password: 'a-fine-password-123' }) });
  const carol = await (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'carol@example.com', password: 'a-fine-password-123' }) })).json();
  const group = await call('POST', '/communities', bobToken, { name: 'Miracle cures', description: 'buy our pills', privacy: 'public' });
  const page = await call('POST', '/pages', bobToken, { name: 'Lottery Winners', description: 'claim your prize' });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function newPage(token, id, name, { lang = 'en', theme = 'light', width = 390 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, i, n, l, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', i); localStorage.setItem('username', n);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', l); localStorage.setItem('theme', th);
    }, [token, String(id), name, lang, theme]);
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}/${lang}: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`${name}/${lang}: ${e.message}`));
    return p;
  }
  const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const EN = locale('en');

  // 1. Carol reports the group and the page from their screens.
  const c = await newPage(carol.token, carol.id, 'carol');
  for (const [url, label, name, reason] of [[`/groups/${group.id}`, EN.groups.report, 'Miracle cures', EN.report.reasons.misinformation], [`/pages/${page.id}`, EN.pages.report, 'Lottery Winners', EN.report.reasons.spam]]) {
    await c.goto(WEB + url, { waitUntil: 'networkidle' });
    const btn = c.getByRole('button', { name: label });
    await btn.waitFor({ timeout: 8000 }).catch(() => {});
    check(`${name}: a "${label}" button for a visitor`, (await btn.count()) === 1);
    await btn.click();
    const dialog = c.getByRole('dialog');
    check(`${name}: the dialog names it`, (await dialog.getByText(fill(EN.report.title, { label: name }), { exact: true }).count()) >= 1);
    await dialog.getByLabel(reason).check();
    await dialog.getByRole('button', { name: EN.report.submit }).click();
    await dialog.getByText(EN.report.submitted).first().waitFor({ timeout: 5000 }).catch(() => {});
    check(`${name}: report submitted`, (await dialog.getByText(EN.report.submitted).count()) >= 1);
    await dialog.getByRole('button', { name: EN.common.done }).click();
  }
  await c.context().close();

  // 2. Bob (who runs them) has no report button, only his own tools.
  const b = await newPage(bobToken, 2, 'bob');
  await b.goto(`${WEB}/pages/${page.id}`, { waitUntil: 'networkidle' });
  check('the page owner sees Edit, not Report', (await b.getByRole('button', { name: EN.pages.report }).count()) === 0 && (await b.getByRole('button', { name: EN.pages.edit }).count()) === 1);
  await b.context().close();

  // 3. The moderator sees both and removes the group (after confirming).
  const a = await newPage(aliceToken, 1, 'alice', { width: 375 });
  await a.goto(`${WEB}/admin?section=reports`, { waitUntil: 'networkidle' });
  await a.locator('.admin-report').first().waitFor({ timeout: 8000 }).catch(() => {});
  const groupCard = a.locator('.admin-report', { hasText: 'Miracle cures' });
  check('admin: group card "Group Miracle cures", made by bob', (await groupCard.getByText(stripTags(fill(EN.admin.groupNamed, { name: 'Miracle cures' }))).count()) === 1
    && (await groupCard.getByText(fill(EN.admin.madeBy, { name: 'bob' })).count()) === 1);
  check('admin: page card "Page Lottery Winners"', (await a.locator('.admin-report', { hasText: 'Lottery Winners' }).getByText(stripTags(fill(EN.admin.pageNamed, { name: 'Lottery Winners' }))).count()) === 1);
  check('admin: no horizontal scroll at 375px', await noHScroll(a));
  await groupCard.getByRole('button', { name: EN.admin.removeGroup }).click();
  const confirm = a.getByRole('dialog');
  check('removing a group asks first, saying its posts go too', (await confirm.getByText(EN.admin.confirmRemoveBody).count()) === 1);
  await confirm.getByRole('button', { name: EN.admin.removeGroup }).click();
  await a.waitForTimeout(1000);
  check('server: the group is gone', sql(`SELECT count(*) FROM communities WHERE id = ${group.id}`) === '0');
  check('the page is untouched until acted on', sql(`SELECT count(*) FROM pages WHERE id = ${page.id}`) === '1');
  await a.getByRole('tab', { name: EN.admin.reviewedTab }).click();
  await a.getByText(`${EN.admin.removedGroup} by alice`).waitFor({ timeout: 5000 }).catch(() => {});
  check('reviewed: "Group removed by alice"', (await a.getByText(`${EN.admin.removedGroup} by alice`).count()) === 1);
  await a.screenshot({ path: path.join(SP, 'day24-admin-en.png'), fullPage: true });
  await a.context().close();

  // 4. Arabic, RTL: the page card, translated.
  const A = locale('ar');
  const ar = await newPage(aliceToken, 1, 'alice', { lang: 'ar', theme: 'dark', width: 430 });
  await ar.goto(`${WEB}/admin?section=reports`, { waitUntil: 'networkidle' });
  await ar.locator('.admin-report').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: page card translated', (await ar.getByText(stripTags(fill(A.admin.pageNamed, { name: 'Lottery Winners' }))).count()) === 1);
  check('ar: no horizontal scroll', await noHScroll(ar));
  await ar.screenshot({ path: path.join(SP, 'day24-admin-ar.png'), fullPage: true });
  await ar.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
