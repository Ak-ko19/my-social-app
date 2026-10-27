// Day 103: bulk actions on reports. An admin has three reported posts and
// one reported account waiting. Each card has a checkbox; picking two and
// "Dismiss" closes both (the posts stay); "Select all on this page" and
// "Remove content" asks first, then removes the post and says the account
// report couldn't be (it stays waiting). Each decision is in the admin log,
// marked bulk. axe on the list with the bar. EN/light 390 px and AR/dark
// 375 px (RTL). Throwaway stack from e2e-up.sh.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');
const EN = require('../frontend/src/i18n/locales/en.json');
const AR = require('../frontend/src/i18n/locales/ar.json');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const PASSWORD = 'a-fine-password-123';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const shows = (locator, timeout = 10000) => locator.waitFor({ timeout }).then(() => true, () => false);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim().replace(/\r/g, '');
const json = { 'Content-Type': 'application/json' };
const as = (user) => ({ Authorization: `Bearer ${user.token}` });
const fill = (text, values) => Object.entries(values).reduce((t, [k, v]) => t.split(`{{${k}}}`).join(v), text);
// i18next plural keys: English _one/_other, Arabic all six forms.
const plural = (L, obj, key, count, values = {}) => {
  const form = new Intl.PluralRules(L === AR ? 'ar' : 'en').select(count);
  return fill(obj[`${key}_${form}`] ?? obj[`${key}_other`], { count, ...values });
};

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}
async function post(user, content) {
  const form = new FormData();
  form.append('content', content);
  return (await fetch(`${API}/posts`, { method: 'POST', headers: as(user), body: form })).json();
}
const report = async (user, targetType, targetId) =>
  (await (await fetch(`${API}/reports`, { method: 'POST', headers: { ...as(user), ...json }, body: JSON.stringify({ targetType, targetId, reason: 'spam' }) })).json()).id;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const B = c.L.admin.bulk;
    // Only this round's reports are waiting.
    sql("UPDATE reports SET status = 'reviewed' WHERE status = 'pending'");
    const [boss, author, reporter] = await Promise.all(['boss', 'author', 'reporter'].map((n) => account(`${n}103${c.lang}`)));
    sql(`UPDATE users SET is_admin = true WHERE id = ${boss.id}`);
    const posts = [];
    for (const text of ['Cheap pills here', 'Free money now', 'Click this link']) posts.push(await post(author, text));
    const ids = [];
    for (const p of posts) ids.push(await report(reporter, 'post', p.id));
    const accountReport = await report(reporter, 'user', author.id);

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [boss.token, boss.id, boss.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    await page.goto(`${WEB}/admin?section=reports`, { waitUntil: 'networkidle' });
    const boxes = page.locator('.admin-report-select');
    check(`${tag}: each waiting report has a checkbox`, await shows(boxes.first()) && (await boxes.count()) === 4);
    const bar = page.getByRole('region', { name: B.label });
    check(`${tag}: the bar is there, its buttons off until something is picked`, await shows(bar)
      && await bar.getByRole('button', { name: c.L.admin.dismiss, exact: true }).isDisabled());
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

    // Dismiss the first two (the cards are oldest first).
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    check(`${tag}: "2 selected"`, (await bar.innerText()).includes(plural(c.L, B, 'selected', 2)));
    await page.waitForTimeout(400);
    await page.addScriptTag({ content: AXE });
    const bad = (await page.evaluate(() => window.axe.run('.screen-enter'))).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${tag}: axe finds nothing serious (cards, checkboxes, bar)`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`).join(' | '));
    await page.screenshot({ path: path.join(SP, `day103-selected-${c.lang}-${c.theme}.png`) });
    await bar.getByRole('button', { name: c.L.admin.dismiss, exact: true }).click();
    const status = page.locator('.admin-bulk-result');
    check(`${tag}: "2 dismissed"`, await shows(status) && (await status.innerText()) === plural(c.L, B.done, 'dismiss', 2), await status.innerText().catch(() => ''));
    check(`${tag}: ...both closed, the posts kept`, sql(`SELECT count(*) FROM reports WHERE id IN (${ids[0]}, ${ids[1]}) AND status = 'reviewed' AND resolution = 'dismissed'`) === '2'
      && sql(`SELECT count(*) FROM posts WHERE id IN (${posts[0].id}, ${posts[1].id})`) === '2');
    check(`${tag}: two left`, await page.waitForFunction(() => document.querySelectorAll('.admin-report-select').length === 2, null, { timeout: 8000 }).then(() => true, () => false));

    // Select all, Remove (asks first).
    await page.getByRole('checkbox', { name: B.selectAll, exact: true }).check();
    await bar.getByRole('button', { name: B.remove, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: plural(c.L, B, 'confirmRemoveTitle', 2) });
    check(`${tag}: Remove asks first`, await shows(dialog));
    await dialog.getByRole('button', { name: B.remove, exact: true }).click();
    const failedLine = plural(c.L, B, 'failed', 1, { reasons: '' });
    await page.waitForFunction((text) => document.querySelector('.admin-bulk-result')?.textContent.includes(text), failedLine.trim(), { timeout: 10000 }).catch(() => {});
    const line = await status.innerText();
    check(`${tag}: "1 removed · 1 couldn't be: <why>"`, line.startsWith(plural(c.L, B.done, 'remove', 1)) && line.includes(failedLine.trim()), line);
    check(`${tag}: ...the post is gone, the account report still waits`, sql(`SELECT count(*) FROM posts WHERE id = ${posts[2].id}`) === '0'
      && sql(`SELECT status FROM reports WHERE id = ${accountReport}`) === 'pending');
    check(`${tag}: three log entries, marked bulk`, sql(`SELECT count(*) FROM admin_actions WHERE admin_id = ${boss.id} AND details->>'bulk' = 'true'`) === '3');
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    await page.screenshot({ path: path.join(SP, `day103-result-${c.lang}-${c.theme}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
