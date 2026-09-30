// Day 12 step 1: reporting comments and messages, and what the moderator
// sees. Throwaway stack (e2e-up.sh): alice(1) is made admin via SQL, bob(2)
// owns post 1; carol is created here and is rude in a comment and a DM.
// EN/MY/AR (RTL), light/dark, 375-430px.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const PG = (process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin');
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const fill = (text, values) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k]);
const stripTags = (text) => text.replace(/<\/?link>/g, '');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`"${PG}/psql.exe" -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const call = async (method, url, token, body) => {
  const res = await fetch(API + url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, json, text };
};

(async () => {
  sql('UPDATE users SET is_admin = true WHERE id = 1');
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'carol', email: 'carol@example.com', password: 'a-fine-password-123' }) });
  const carol = await (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'carol@example.com', password: 'a-fine-password-123' }) })).json();
  const rude = await call('POST', '/posts/1/comments', carol.token, { content: 'you are all losers' });
  await call('POST', '/posts/1/comments', bobToken, { content: 'thanks everyone' });
  const conv = (await call('POST', '/conversations', carol.token, { userId: 2 })).json;
  const threat = (await call('POST', `/conversations/${conv.id}/messages`, carol.token, { content: 'pay me or else' })).json;
  await call('POST', `/conversations/${conv.id}/messages`, bobToken, { content: 'please stop' });
  check('setup: comment, conversation and message created', Boolean(rude.json?.id && conv?.id && threat?.id));

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async (token, id, name, { lang = 'en', theme = 'light', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, i, n, l, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', i); localStorage.setItem('username', n);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', l); localStorage.setItem('theme', th);
    }, [token, String(id), name, lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}/${lang}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${name}/${lang}: ${e.message}`));
    return page;
  };
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

  // 1. Bob reports carol's comment and her message, in three languages.
  for (const [lang, theme, width] of [['en', 'light', 375], ['my', 'dark', 390], ['ar', 'dark', 430]]) {
    const L = locale(lang);
    const label = `${lang}/${theme}/${width}px`;
    const page = await newPage(bobToken, 2, 'bob', { lang, theme, width });
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: L.feed.comment, exact: true }).first().click();
    await page.getByText('you are all losers').waitFor({ timeout: 8000 }).catch(() => {});
    const reportCarol = page.getByRole('button', { name: fill(L.comments.reportAria, { name: 'carol' }), exact: true });
    check(`${label}: "Report" on carol's comment`, (await reportCarol.count()) === 1);
    check(`${label}: no "Report" on bob's own comment`, (await page.getByRole('button', { name: fill(L.comments.reportAria, { name: 'bob' }), exact: true }).count()) === 0);
    await reportCarol.click();
    const title = fill(L.report.title, { label: L.report.thisComment });
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 }).catch(() => {});
    check(`${label}: dialog says "${title}"`, (await dialog.getByText(title, { exact: true }).count()) >= 1);
    if (lang === 'en') {
      await dialog.getByLabel(L.report.reasons.harassment).check();
      await dialog.getByRole('button', { name: L.report.submit }).click();
      await dialog.getByText(L.report.submitted).first().waitFor({ timeout: 5000 }).catch(() => {});
      check(`${label}: comment report submitted`, (await dialog.getByText(L.report.submitted).count()) >= 1);
      await dialog.getByRole('button', { name: L.common.done }).click();
    } else {
      await dialog.getByRole('button', { name: L.common.cancel }).click();
    }
    check(`${label}: feed: no horizontal scroll`, await noHScroll(page));

    await page.goto(`${WEB}/messages/${conv.id}`, { waitUntil: 'networkidle' });
    await page.getByText('pay me or else').waitFor({ timeout: 8000 }).catch(() => {});
    const flags = page.getByRole('button', { name: L.messages.reportMessage, exact: true });
    check(`${label}: exactly one flag -- on carol's message, not bob's own`, (await flags.count()) === 1);
    const row = page.locator('.messages-bubble-row', { hasText: 'pay me or else' });
    check(`${label}: the flag sits by carol's message`, (await row.getByRole('button', { name: L.messages.reportMessage, exact: true }).count()) === 1);
    check(`${label}: chat: no horizontal scroll`, await noHScroll(page));
    await page.screenshot({ path: path.join(SP, `day12-report-chat-${lang}-${theme}-${width}.png`) });
    await flags.click();
    await dialog.waitFor({ timeout: 5000 }).catch(() => {});
    check(`${label}: dialog says "${fill(L.report.title, { label: L.report.thisMessage })}"`,
      (await dialog.getByText(fill(L.report.title, { label: L.report.thisMessage }), { exact: true }).count()) >= 1);
    if (lang === 'en') {
      await dialog.getByLabel(L.report.reasons.spam).check();
      await page.locator('.report-dialog-details').fill('threatening me');
      await dialog.getByRole('button', { name: L.report.submit }).click();
      await dialog.getByText(L.report.submitted).first().waitFor({ timeout: 5000 }).catch(() => {});
      check(`${label}: message report submitted`, (await dialog.getByText(L.report.submitted).count()) >= 1);
    }
    await page.context().close();
  }

  // 2. Someone outside the chat can't report (or probe) its messages.
  const outsider = await call('POST', '/reports', aliceToken, { targetType: 'message', targetId: threat.id, reason: 'spam' });
  check('API: outsider reporting a chat message -> 404', outsider.status === 404 && outsider.text === 'Message not found');

  // 3. The moderator sees exactly the reported comment and message.
  {
    const L = locale('en');
    const admin = await newPage(aliceToken, 1, 'alice');
    await admin.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
    await admin.locator('.admin-report').first().waitFor({ timeout: 8000 }).catch(() => {});
    const commentCard = admin.locator('.admin-report', { hasText: 'you are all losers' });
    const messageCard = admin.locator('.admin-report', { hasText: 'pay me or else' });
    check('admin: 2 pending reports', (await admin.locator('.admin-report').count()) === 2);
    check('admin: comment card says "Comment by carol" with the text and an "Open post" link',
      (await commentCard.getByText(stripTags(fill(L.admin.commentBy, { name: 'carol' }))).count()) === 1
      && (await commentCard.getByRole('link', { name: L.admin.openPost }).count()) === 1);
    check('admin: message card says "Message from carol", with the reporter\'s note',
      (await messageCard.getByText(stripTags(fill(L.admin.messageBy, { name: 'carol' }))).count()) === 1
      && (await messageCard.getByText('threatening me').count()) === 1);
    check('admin: the rest of the chat is not shown', (await admin.getByText('please stop').count()) === 0);

    // Carol unsends it: the evidence stays.
    await call('DELETE', `/conversations/${conv.id}/messages/${threat.id}`, carol.token);
    await admin.reload({ waitUntil: 'networkidle' });
    await admin.locator('.admin-report').first().waitFor({ timeout: 8000 }).catch(() => {});
    const unsent = admin.locator('.admin-report', { hasText: L.admin.messageDeleted });
    check('admin: after carol unsends it -> "Message (unsent)" + the text as reported',
      (await unsent.count()) === 1 && (await unsent.getByText(L.admin.asReported).count()) === 1 && (await unsent.getByText('pay me or else').count()) === 1);
    await admin.screenshot({ path: path.join(SP, 'day12-report-admin-en.png'), fullPage: true });

    // Arabic, dark, 430px: same cards, translated, no sideways scroll.
    const A = locale('ar');
    const adminAr = await newPage(aliceToken, 1, 'alice', { lang: 'ar', theme: 'dark', width: 430 });
    await adminAr.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
    await adminAr.locator('.admin-report').first().waitFor({ timeout: 8000 }).catch(() => {});
    check('ar admin: "Comment by carol" translated', (await adminAr.getByText(stripTags(fill(A.admin.commentBy, { name: 'carol' }))).count()) === 1);
    check('ar admin: unsent message translated', (await adminAr.getByText(A.admin.messageDeleted).count()) === 1);
    check('ar admin: no horizontal scroll', await noHScroll(adminAr));
    await adminAr.screenshot({ path: path.join(SP, 'day12-report-admin-ar.png'), fullPage: true });
    await adminAr.context().close();

    // Banning carol from the comment card resolves both.
    await commentCard.getByRole('button', { name: fill(L.admin.ban, { name: 'carol' }) }).click();
    await admin.getByRole('button', { name: L.admin.confirmBan }).click();
    await admin.getByText(L.admin.emptyPending).waitFor({ timeout: 8000 }).catch(() => {});
    check('admin: ban carol -> both reports resolved', (await admin.getByText(L.admin.emptyPending).count()) === 1);
    await admin.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
