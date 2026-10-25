// Days 83-84: Memories. mira has posts from this day 1 and 3 years ago
// (moved back in time in the database) and one from another day: Home
// shows "On this day", which hides for the day and stays hidden on reload;
// the Menu opens Memories with a section per year; the morning job tells
// her ("You have memories from 1 year ago"), which opens Memories. EN/light 390 px and
// AR/dark 375 px (RTL), the browser in UTC. Throwaway stack from e2e-up.sh.
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
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const shows = (locator, timeout = 10000) => locator.waitFor({ timeout }).then(() => true, () => false);
const json = { 'Content-Type': 'application/json' };
// Day 84: the morning job, run here against the test database (the
// stack's own ticker waits 10 minutes between runs).
process.env.DATABASE_URL = 'postgresql://testuser@localhost:55433/mysocialapp_e2e';
const memoryNotifications = require('../backend/services/memoryNotificationService');
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: { Authorization: `Bearer ${me.token}` } });
  return me;
}
async function postBack(user, content, interval) {
  const form = new FormData();
  form.append('content', content);
  const p = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body: form })).json();
  // created_at holds the database's local time (see memoryController).
  sql(`UPDATE posts SET created_at = (now() - interval '${interval}') AT TIME ZONE current_setting('TimeZone') WHERE id = ${p.id}`);
  return p;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const T = c.L.memories;
    const mira = await account(`mira83${c.lang}`);
    await postBack(mira, 'Climbing Mount Popa', '1 year');
    await postBack(mira, 'My very first post', '3 years');
    await postBack(mira, 'Some other day', '1 year 10 days');

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 }, timezoneId: 'UTC' });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [mira.token, mira.id, mira.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));

    // Home: the card.
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    const card = page.locator('.memories-card');
    check(`${tag}: Home shows "On this day"`, await shows(card.getByRole('heading', { name: T.cardTitle })));
    const cardText = await card.innerText().catch(() => '');
    check(`${tag}: ...from 1 year ago, quoting it`, cardText.includes(T.cardText_one.replace('{{count}}', '1')) && cardText.includes('Climbing Mount Popa'), cardText.replace(/\s+/g, ' '));
    check(`${tag}: no horizontal scroll (Home)`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.waitForTimeout(700);
    await card.screenshot({ path: path.join(SP, `day83-memories-card-${c.lang}-${c.theme}.png`) });
    await card.getByRole('button', { name: T.hideToday }).click();
    check(`${tag}: hiding takes it away`, await card.count() === 0);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    check(`${tag}: ...for the rest of the day`, (await card.count()) === 0);

    // Menu -> Memories.
    await page.goto(`${WEB}/menu`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(c.L.menu.memories) }).click();
    await page.waitForURL(/\/memories$/, { timeout: 8000 }).catch(() => {});
    check(`${tag}: the Menu opens Memories`, page.url().endsWith('/memories'), page.url());
    const one = c.lang === 'ar' ? T.yearsAgo_one : T.yearsAgo_one.replace('{{count}}', '1');
    const three = (c.lang === 'ar' ? T.yearsAgo_few : T.yearsAgo_other).replace('{{count}}', '3');
    const year = new Date().getUTCFullYear();
    check(`${tag}: a section for 1 year ago`, await shows(page.getByRole('heading', { name: `${one} · ${year - 1}` })));
    check(`${tag}: ...and for 3 years ago`, await shows(page.getByRole('heading', { name: `${three} · ${year - 3}` })));
    const body = await page.locator('.phone-shell').innerText();
    check(`${tag}: the posts of this day, not of another`, body.includes('Climbing Mount Popa') && body.includes('My very first post') && !body.includes('Some other day'));
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll (Memories)`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SP, `day83-memories-${c.lang}-${c.theme}-${c.width}.png`) });

    // Day 84: the morning notification -- mira's zone is set to one where it
    // is morning-to-night on the same date as UTC (her posts were moved back
    // by whole years from UTC now).
    const hourIn = (zone) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const dateIn = (zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
    const zone = ['UTC', 'Etc/GMT-3', 'Etc/GMT-6', 'Etc/GMT-9', 'Etc/GMT-12', 'Etc/GMT+3', 'Etc/GMT+6', 'Etc/GMT+9']
      .find((z) => hourIn(z) >= 8 && dateIn(z) === dateIn('UTC'));
    sql(`UPDATE users SET time_zone = '${zone}' WHERE id = ${mira.id}`);
    const run = await memoryNotifications.notifyDue({ force: true });
    check(`${tag}: the morning job tells mira`, run.people >= 1, JSON.stringify(run));
    await page.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
    const words = c.L.notifications.types.memories_one.replace(/<\/?b>/g, '').replace('{{count}}', '1');
    const row = page.locator('a.notif-main', { hasText: words });
    check(`${tag}: "You have memories from 1 year ago"`, await shows(row));
    await row.click();
    await page.waitForURL((u) => u.pathname === '/memories', { timeout: 8000 }).catch(() => {});
    check(`${tag}: ...opens Memories`, page.url().endsWith('/memories'), page.url());
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
