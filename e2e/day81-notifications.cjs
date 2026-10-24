// Days 81-82: the notifications center. Three people like nina's post, two
// follow her and one mentions her; the list shows one row for the likes
// ("..., ... and 1 other liked your post"), one for the follows, and the
// mention; the tabs show their kinds; a new like while the list is open is
// offered ("New notifications") and the badge on Home follows it live;
// tapping the likes opens the post and reads the row; a post an admin
// removes is explained ("We removed your post... Reason: Spam"). EN/light 390 px and
// AR/dark 375 px (RTL). Throwaway stack from e2e-up.sh.
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
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
const { PSQL } = require('./pg.cjs');
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
// Polls until fn() is true (a tab's list replaces the last one a moment later).
async function until(fn, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return true;
  return false;
}

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: { Authorization: `Bearer ${me.token}` } });
  return me;
}
const as = (user) => ({ Authorization: `Bearer ${user.token}` });
async function post(user, content) {
  const form = new FormData();
  form.append('content', content);
  return (await fetch(`${API}/posts`, { method: 'POST', headers: as(user), body: form })).json();
}
const like = (user, p) => fetch(`${API}/posts/${p.id}/like`, { method: 'POST', headers: as(user) });
const follow = (user, target) => fetch(`${API}/users/${target.id}/follow`, { method: 'POST', headers: as(user) });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const T = c.L.notifications;
    const nina = await account(`nina81${c.lang}`);
    const [ana, ben, cal, dee] = await Promise.all(['ana', 'ben', 'cal', 'dee'].map((n) => account(`${n}81${c.lang}`)));
    const trip = await post(nina, 'My trip to Bagan');
    for (const fan of [ana, ben, cal]) await like(fan, trip);
    for (const fan of [ana, dee]) await follow(fan, nina);
    await post(ben, `Look at this @${nina.username}`);

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [nina.token, nina.id, nina.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    await page.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });

    const rows = page.locator('li.notif-row');
    await shows(rows.first());
    const sentences = await page.locator('.notif-sentence').allInnerTexts();
    const likes = c.L.notifications.grouped.likeMany_one.replace(/<\/?b>/g, '').replace('{{name}}', cal.username).replace('{{name2}}', ben.username).replace('{{count}}', '1');
    const follows = c.L.notifications.grouped.followTwo.replace(/<\/?b>/g, '').replace('{{name}}', dee.username).replace('{{name2}}', ana.username);
    check(`${tag}: three likes are one row`, sentences.includes(likes), sentences.join(' | '));
    check(`${tag}: two follows are one row`, sentences.includes(follows), sentences.join(' | '));
    check(`${tag}: three rows in all (likes, follows, mention)`, (await rows.count()) === 3, String(await rows.count()));
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.waitForTimeout(700); // the entrance animation
    await page.screenshot({ path: path.join(SP, `day81-notifications-${c.lang}-${c.theme}-${c.width}.png`), fullPage: true });

    // Tabs.
    await page.getByRole('tab', { name: T.filter.mentions, exact: true }).click();
    check(`${tag}: Mentions shows the mention only`, await until(async () => (await rows.count()) === 1
      && (await page.locator('.notif-sentence').first().innerText()).includes(ben.username)));
    await page.getByRole('tab', { name: T.filter.follows, exact: true }).click();
    check(`${tag}: Follows shows the follows only`, await until(async () => (await rows.count()) === 1
      && (await page.locator('.notif-sentence').first().innerText()) === follows));
    await page.getByRole('tab', { name: T.filter.all, exact: true }).click();
    await shows(page.getByText(likes, { exact: true }));

    // Live: a new like on another post while the list is open -- and Home,
    // open in another tab, follows it on its bell.
    const home = await ctx.newPage();
    await home.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    const bell = (n) => home.locator('.top-app-bar button').filter({ has: home.locator('svg') }).and(home.locator(`[aria-label*="${n}"]`));
    check(`${tag}: Home's bell says 6 unread`, await shows(bell(6)));
    const view = await post(nina, 'The view from the top');
    await like(dee, view);
    check(`${tag}: ...and 7 as soon as the like comes in`, await shows(bell(7)));
    await home.close();
    const pill = page.getByRole('button', { name: T.showNew, exact: true });
    check(`${tag}: something new is offered at once`, await shows(pill));
    await pill.click();
    check(`${tag}: ...and shown when asked`, await shows(rows.nth(3)) && (await rows.count()) === 4);

    // Tapping the likes opens the post and reads them.
    const likesRow = page.locator('a.notif-main', { hasText: likes });
    await likesRow.click();
    await page.waitForURL(/\/posts\/\d+$/, { timeout: 8000 }).catch(() => {});
    check(`${tag}: tapping the likes opens the post`, page.url().endsWith(`/posts/${trip.id}`), page.url());
    let unread = null;
    await until(async () => {
      unread = await (await fetch(`${API}/notifications/unread-count`, { headers: as(nina) })).json();
      return unread.unreadCount === 4;
    });
    // 7 unread before: the three likes are read, the rest (2 follows, the
    // mention, the new like) are not.
    check(`${tag}: ...and reads all three likes`, unread.unreadCount === 4, JSON.stringify(unread));

    // Day 82: an admin removes nina's reported post; she is told what and why.
    const bad = await post(nina, 'Cheap pills, buy now');
    await fetch(`${API}/reports`, { method: 'POST', headers: { ...as(dee), ...json }, body: JSON.stringify({ targetType: 'post', targetId: bad.id, reason: 'spam' }) });
    sql(`UPDATE users SET is_admin = true WHERE id = ${ana.id}`);
    const reportId = sql(`SELECT id FROM reports WHERE target_type = 'post' AND target_id = ${bad.id}`);
    await fetch(`${API}/admin/reports/${reportId}/remove-content`, { method: 'POST', headers: as(ana) });
    await page.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
    const removedLine = c.L.notifications.types.contentRemoved.replace(/<\/?b>/g, '')
      .replace('{{kind}}', c.L.notifications.removedKinds.post).replace('{{reason}}', c.L.report.reasons.spam);
    check(`${tag}: a removed post is explained`, await shows(page.locator('.notif-sentence', { hasText: removedLine })));
    check(`${tag}: ...quoting it`, await shows(page.getByText('“Cheap pills, buy now”')));
    await page.getByRole('button', { name: c.L.notifications.readRules, exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/terms', { timeout: 8000 }).catch(() => {});
    check(`${tag}: ...with the rules a tap away`, page.url().endsWith('/terms'), page.url());
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
