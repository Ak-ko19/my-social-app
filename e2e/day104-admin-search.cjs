// Days 103-104: the admin content search. Kim (a private account) has a
// followers-only post and an "only me" post about cheap pills, and one in a
// private group. Admin > Search: typing does nothing until Search; then all
// three are listed, newest first, with where they are and who sees them.
// Accounts: Kim's exact email finds Kim. Admin > Log has both searches
// ("searched posts for “cheap pills”"). axe on the panel. EN/light 390 px
// and AR/dark 375 px (RTL). Throwaway stack from e2e-up.sh.
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
const isolate = /[⁨⁩]/g;

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}
async function post(user, content, fields = {}) {
  const form = new FormData();
  form.append('content', content);
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  return (await fetch(`${API}/posts`, { method: 'POST', headers: as(user), body: form })).json();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const S = c.L.admin.search;
    const [boss, kim] = await Promise.all(['boss', 'kim'].map((n) => account(`${n}104${c.lang}`)));
    sql(`UPDATE users SET is_admin = true WHERE id = ${boss.id}`);
    await fetch(`${API}/profile/privacy`, { method: 'PUT', headers: { ...as(kim), ...json }, body: JSON.stringify({ isPrivate: true }) });
    const words = `cheap pills ${c.lang}`;
    await post(kim, `${words} for followers`, { visibility: 'followers' });
    await post(kim, `${words} only for me`, { visibility: 'only_me' });
    const club = await (await fetch(`${API}/communities`, { method: 'POST', headers: { ...as(kim), ...json }, body: JSON.stringify({ name: `Secret club ${c.lang}`, privacy: 'private' }) })).json();
    await post(kim, `${words} for the club`, { communityId: club.id });

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [boss.token, boss.id, boss.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    await page.goto(`${WEB}/admin?section=search`, { waitUntil: 'networkidle' });
    const box = page.getByRole('searchbox', { name: S.label });
    check(`${tag}: Admin has a Search section, which says searches are logged`, await shows(box) && await shows(page.getByText(S.note, { exact: true })));
    await box.fill(words);
    await page.waitForTimeout(600);
    check(`${tag}: typing alone searches nothing (nothing logged)`, sql(`SELECT count(*) FROM admin_actions WHERE admin_id = ${boss.id}`) === '0');
    await page.getByRole('button', { name: S.submit, exact: true }).click();
    const list = page.getByRole('list', { name: fill(S.resultsLabel, { q: words }) });
    check(`${tag}: all three posts, private ones too`, await shows(list) && (await list.getByRole('listitem').count()) === 3);
    const texts = await list.getByRole('listitem').allInnerTexts();
    check(`${tag}: ...newest first, the group one says "private group"`, texts[0].includes('for the club') && texts[0].includes(fill(S.inPrivateGroup, { name: club.name })), texts[0]);
    check(`${tag}: ..."only me" says so`, texts[1].includes(c.L.compose.onlyMe));
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.waitForTimeout(400);
    await page.addScriptTag({ content: AXE });
    const bad = (await page.evaluate(() => window.axe.run('.screen-enter'))).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${tag}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`).join(' | '));
    await page.screenshot({ path: path.join(SP, `day104-posts-${c.lang}-${c.theme}.png`) });

    // Accounts: by exact email.
    await box.fill(`KIM104${c.lang.toUpperCase()}@example.com`);
    await page.getByRole('radio', { name: S.kinds.users, exact: true }).click();
    await page.getByRole('button', { name: S.submit, exact: true }).click();
    const accounts = page.getByRole('list', { name: fill(S.resultsLabel, { q: `KIM104${c.lang.toUpperCase()}@example.com` }) });
    check(`${tag}: Accounts: the exact email finds Kim, private`, await shows(accounts)
      && (await accounts.getByRole('link', { name: kim.username, exact: true }).count()) === 1
      && (await accounts.innerText()).includes(S.private));

    // The log.
    await page.goto(`${WEB}/admin?section=log`, { waitUntil: 'networkidle' });
    const sentence = fill(c.L.admin.log.sentence.admin_search, { admin: boss.username, kind: c.L.admin.log.searchKinds.posts, name: words });
    await page.locator('.admin-log-sentence').first().waitFor({ timeout: 8000 }).catch(() => {});
    const logged = (await page.locator('.admin-log-sentence').allInnerTexts()).map((t) => t.replace(isolate, ''));
    check(`${tag}: the log has both searches`, logged.includes(sentence) && logged.length >= 2, JSON.stringify(logged.slice(0, 2)));
    await page.screenshot({ path: path.join(SP, `day104-log-${c.lang}-${c.theme}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
