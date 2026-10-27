// Day 101: new-post notifications per group and page. Ana is in Lin's
// group and follows Lin's page. On the group, the bell says "Notifications:
// Highlights"; its dialog offers All posts / Highlights / Off (each with a
// line saying what it means) and Ana picks All posts. Kim (a member Ana
// doesn't follow) posts: Ana hears about it ("kim posted in GROUP", the
// post's first words) and the row opens the post. Off: Kim's next post
// stays quiet. The page's post: "PAGE has a new post" with the page's
// initials. axe on the dialog and the list. EN/light 390 px and AR/dark
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
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const json = { 'Content-Type': 'application/json' };
const as = (user) => ({ Authorization: `Bearer ${user.token}` });
const fill = (text, values) => Object.entries(values).reduce((t, [k, v]) => t.split(`{{${k}}}`).join(v), text);
const plain = (html) => html.replace(/<\/?b>/g, '');

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}
const call = async (user, method, url, body) =>
  (await fetch(`${API}${url}`, { method, headers: { ...as(user), ...json }, body: body && JSON.stringify(body) })).json();
async function post(user, content, field, id) {
  const form = new FormData();
  form.append('content', content);
  form.append(field, String(id));
  return (await fetch(`${API}/posts`, { method: 'POST', headers: as(user), body: form })).json();
}

async function axeOf(page, selector) {
  await page.addScriptTag({ content: AXE });
  return (await page.evaluate((sel) => window.axe.run(sel), selector)).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const P = c.L.postNotifications;
    const [ana, lin, kim] = await Promise.all(['ana', 'lin', 'kim'].map((n) => account(`${n}101${c.lang}`)));
    const group = await call(lin, 'POST', '/communities', { name: `Tea House ${c.lang}`, privacy: 'public' });
    for (const u of [ana, kim]) await call(u, 'POST', `/communities/${group.id}/join`);
    const cafe = await call(lin, 'POST', '/pages', { name: `Corner Cafe ${c.lang}` });
    await call(ana, 'POST', `/pages/${cafe.id}/follow`);

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [ana.token, ana.id, ana.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    // ---- The group's bell ----
    await page.goto(`${WEB}/groups/${group.id}`, { waitUntil: 'networkidle' });
    const bell = page.getByRole('button', { name: fill(P.button, { level: P.levels.highlights }), exact: true });
    check(`${tag}: the group has a bell: "Notifications: Highlights"`, await shows(bell));
    check(`${tag}: no horizontal scroll with it in the header`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await bell.click();
    const dialog = page.getByRole('dialog', { name: fill(P.title, { name: group.name }) });
    check(`${tag}: its dialog offers the three choices, each explained`, await shows(dialog)
      && (await dialog.getByRole('radio').count()) === 3 && (await dialog.innerText()).includes(P.hints.group.highlights));
    // Settled first: on a busy machine axe once measured mid-render.
    await page.waitForTimeout(500);
    const dialogAxe = await axeOf(page, '[role="dialog"]');
    check(`${tag}: the dialog has no serious axe issues`, dialogAxe.length === 0, dialogAxe.join(', '));
    await page.screenshot({ path: path.join(SP, `day101-choice-${c.lang}-${c.theme}.png`) });
    await dialog.getByRole('radio', { name: new RegExp(`^${P.levels.all}`) }).check();
    await page.waitForTimeout(400);
    check(`${tag}: All posts is saved at once`, sql(`SELECT post_notifications FROM community_members WHERE community_id = ${group.id} AND user_id = ${ana.id}`) === 'all');
    await dialog.getByRole('button', { name: c.L.common.done, exact: true }).click();
    check(`${tag}: the bell now says All posts`, await shows(page.getByRole('button', { name: fill(P.button, { level: P.levels.all }), exact: true })));

    // ---- Kim posts; Ana hears about it ----
    const kimPost = await post(kim, 'Who is coming to the tasting on Saturday? Bring a friend.', 'communityId', group.id);
    await post(lin, 'Menu for the week', 'pageId', cafe.id);
    await page.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
    const groupRow = page.getByRole('link', { name: new RegExp(plain(fill(c.L.notifications.types.groupPost, { name: kim.username, group: group.name }))) });
    check(`${tag}: "${kim.username} posted in ${group.name}"`, await shows(groupRow));
    check(`${tag}: ...with the post's first words`, (await groupRow.innerText()).includes('Who is coming to the tasting'));
    const pageRow = page.getByRole('link', { name: new RegExp(plain(fill(c.L.notifications.types.pagePost, { page: cafe.name }))) });
    check(`${tag}: "${cafe.name} has a new post", with the page's initials`, await shows(pageRow) && (await pageRow.innerText()).includes('CO'));
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    const listAxe = await axeOf(page, '.screen-enter');
    check(`${tag}: the list has no serious axe issues`, listAxe.length === 0, listAxe.join(', '));
    await page.screenshot({ path: path.join(SP, `day101-list-${c.lang}-${c.theme}.png`) });
    await groupRow.click();
    await page.waitForURL(`**/posts/${kimPost.id}`, { timeout: 10000 }).catch(() => {});
    check(`${tag}: the row opens the post`, page.url().endsWith(`/posts/${kimPost.id}`), page.url());

    // ---- Off: quiet ----
    await page.goto(`${WEB}/groups/${group.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: fill(P.button, { level: P.levels.all }), exact: true }).click();
    await page.getByRole('dialog').getByRole('radio', { name: new RegExp(`^${P.levels.off}`) }).check();
    await page.waitForTimeout(400);
    await page.getByRole('dialog').getByRole('button', { name: c.L.common.done, exact: true }).click();
    check(`${tag}: Off: the bell says so`, await shows(page.getByRole('button', { name: fill(P.button, { level: P.levels.off }), exact: true })));
    await post(kim, 'Another one', 'communityId', group.id);
    check(`${tag}: ...and Kim's next post stays quiet`, sql(`SELECT count(*) FROM notifications WHERE user_id = ${ana.id} AND type = 'group_post'`) === '1');

    // ---- The page's bell ----
    await page.goto(`${WEB}/pages/${cafe.id}`, { waitUntil: 'networkidle' });
    check(`${tag}: a page you follow has the bell too`, await shows(page.getByRole('button', { name: fill(P.button, { level: P.levels.highlights }), exact: true })));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
