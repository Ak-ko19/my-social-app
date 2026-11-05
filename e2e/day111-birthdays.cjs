// Day 111: birthdays. Ann and Bea follow each other (friends); Cal only
// follows Ann. Ann sets 29 February, Friends, in Edit profile > Birthday:
// Bea sees "Birthday: February 29" on Ann's profile, Cal doesn't. Ann
// makes it Everyone: Cal sees it; then Only me: Bea doesn't. axe on Edit
// profile and the profile. EN/light 390 px and AR/dark 375 px (RTL).
// Throwaway stack from e2e-up.sh.
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

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}

async function contextFor(browser, user, c, tag) {
  const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
  await ctx.addInitScript(([t, id, name, lang, theme]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
    localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
  }, [user.token, user.id, user.username, c.lang, c.theme]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });
  return { ctx, page };
}

async function axe(page, tag, what) {
  await page.waitForTimeout(700);
  await page.addScriptTag({ content: AXE });
  const bad = (await page.evaluate(() => window.axe.run('.screen-enter, #root'))).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(`${tag}: ${what}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`).join(' | '));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const B = c.L.birthday;
    const [ann, bea, cal] = await Promise.all(['ann', 'bea', 'cal'].map((n) => account(`${n}111${c.lang}`)));
    const follow = (a, b) => fetch(`${API}/users/${b.id}/follow`, { method: 'POST', headers: as(a) });
    await follow(ann, bea);
    await follow(bea, ann);
    await follow(cal, ann);
    // What the profile shows, in this language: "Birthday: February 29".
    const feb29 = new Date(Date.UTC(2000, 1, 29, 12)).toLocaleDateString(c.lang === 'ar' ? 'ar-u-nu-latn' : 'en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    const line = fill(c.L.profile.birthday, { date: feb29 });

    // 1. Ann sets it.
    const a = await contextFor(browser, ann, c, `${tag} ann`);
    await a.page.goto(`${WEB}/edit-profile`, { waitUntil: 'networkidle' });
    const section = a.page.getByRole('region', { name: B.title, exact: true });
    check(`${tag}: Edit profile has a Birthday section, saying no year is kept`, await shows(section) && await shows(section.getByText(B.explain, { exact: true })));
    await section.getByRole('combobox', { name: B.month, exact: true }).selectOption('2');
    await section.getByRole('combobox', { name: B.day, exact: true }).selectOption('29');
    check(`${tag}: ...February offers the 29th, not the 30th`, (await section.getByRole('combobox', { name: B.day, exact: true }).locator('option', { hasText: /^30$/ }).count()) === 0);
    await section.getByRole('button', { name: B.save, exact: true }).click();
    check(`${tag}: ...saved, for friends`, await shows(section.getByText(B.saved, { exact: true }))
      && sql(`SELECT birthday_month || '/' || birthday_day || '/' || birthday_audience FROM users WHERE id = ${ann.id}`) === '2/29/friends');
    check(`${tag}: html dir`, (await a.page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: Edit profile: no horizontal scroll`, await a.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await axe(a.page, tag, 'Edit profile with a birthday');
    await section.screenshot({ path: path.join(SP, `day111-edit-${c.lang}-${c.theme}.png`) });

    // 2. Who sees it.
    const b = await contextFor(browser, bea, c, `${tag} bea`);
    const k = await contextFor(browser, cal, c, `${tag} cal`);
    const sees = async (p) => {
      await p.goto(`${WEB}/profile/${ann.id}`, { waitUntil: 'networkidle' });
      await p.getByRole('heading', { name: ann.username }).first().waitFor({ timeout: 8000 }).catch(() => {});
      return (await p.getByText(line, { exact: true }).count()) === 1;
    };
    check(`${tag}: a friend sees "${line}"`, await sees(b.page));
    await axe(b.page, tag, "a friend's view of the profile");
    await b.page.locator('.profile-details').screenshot({ path: path.join(SP, `day111-profile-${c.lang}-${c.theme}.png`) });
    check(`${tag}: ...someone who only follows her doesn't`, !(await sees(k.page)));
    await section.getByRole('combobox', { name: B.audience, exact: true }).selectOption('public');
    await section.getByRole('button', { name: B.save, exact: true }).click();
    await section.getByText(B.saved, { exact: true }).waitFor();
    check(`${tag}: Everyone: now he does`, await sees(k.page));
    await section.getByRole('combobox', { name: B.audience, exact: true }).selectOption('only_me');
    await section.getByRole('button', { name: B.save, exact: true }).click();
    await a.page.waitForTimeout(500);
    check(`${tag}: Only me: not even the friend`, !(await sees(b.page)) && await sees(a.page));
    await Promise.all([a.ctx.close(), b.ctx.close(), k.ctx.close()]);
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
