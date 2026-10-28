// Day 106: page verification requests. Olga runs two pages; Fay follows
// the first, which has a post. Olga asks for the blue tick from Edit page >
// Verification (the request then waits there); the admin approves it in
// Admin > Verification: the tick shows on the page, in the Pages list and on
// the page's post in Fay's feed; Olga is told; the log has it. The second
// page is declined with a reason: Edit page says why and when it can ask
// again. Then the admin takes the first page's tick away (reason, confirm)
// and it is gone for Fay. axe on each screen. EN/light 390 px and AR/dark
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
const isolate = /[⁨⁩]/g;
const stripTags = (s) => s.replace(/<\/?b>/g, '');

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}
const createPage = async (user, name) => (await fetch(`${API}/pages`, {
  method: 'POST', headers: { ...as(user), ...json }, body: JSON.stringify({ name, category: 'business', description: `${name} -- tea and snacks since 1990` })
})).json();

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
  await page.waitForTimeout(700); // the screen's entrance animation
  await page.addScriptTag({ content: AXE });
  const bad = (await page.evaluate(() => window.axe.run('.screen-enter'))).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(`${tag}: ${what}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`).join(' | '));
}
const layoutOk = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const V = c.L.pages.verification;
    const A = c.L.admin.verification;
    const tick = c.L.ui.verified;
    const [boss, olga, fay] = await Promise.all(['boss', 'olga', 'fay'].map((n) => account(`${n}106${c.lang}`)));
    sql(`UPDATE users SET is_admin = true WHERE id = ${boss.id}`);
    const tea = await createPage(olga, `Rangoon Tea ${c.lang}`);
    const other = await createPage(olga, `Second Shop ${c.lang}`);
    await fetch(`${API}/pages/${tea.id}/follow`, { method: 'POST', headers: as(fay) });
    const form = new FormData();
    form.append('content', `Fresh tea today ${c.lang}`);
    form.append('pageId', String(tea.id));
    await fetch(`${API}/posts`, { method: 'POST', headers: as(olga), body: form });
    // The second page has asked already (through the API); the browser asks for the first.
    await fetch(`${API}/pages/${other.id}/verification`, { method: 'POST', headers: { ...as(olga), ...json }, body: JSON.stringify({ note: 'Our second shop' }) });

    // 1. Olga asks.
    const o = await contextFor(browser, olga, c, `${tag} olga`);
    await o.page.goto(`${WEB}/pages/${tea.id}/edit`, { waitUntil: 'networkidle' });
    const section = o.page.getByRole('region', { name: V.title, exact: true });
    check(`${tag}: Edit page has a Verification section with the form`, await shows(section) && await shows(section.getByRole('button', { name: V.ask, exact: true })));
    const note = `We are the tea house on 19th Street (${c.lang})`;
    await section.getByRole('textbox', { name: V.noteLabel, exact: true }).fill(note);
    await section.getByRole('textbox', { name: V.linkLabel, exact: true }).fill('https://rangoontea.example');
    await section.getByRole('button', { name: V.ask, exact: true }).click();
    check(`${tag}: ...sent: it says the request is waiting, with the note`, await shows(section.getByText(V.pending, { exact: true })) && await shows(section.getByText(note, { exact: true })));
    check(`${tag}: ...one pending request in the database`, sql(`SELECT count(*) FROM page_verification_requests WHERE page_id = ${tea.id} AND status = 'pending'`) === '1');
    check(`${tag}: html dir`, (await o.page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: Edit page: no horizontal scroll`, await layoutOk(o.page));
    await axe(o.page, tag, 'Edit page, waiting');
    await o.page.screenshot({ path: path.join(SP, `day106-pending-${c.lang}-${c.theme}.png`), fullPage: true });

    // 2. The admin approves the first, declines the second.
    const b = await contextFor(browser, boss, c, `${tag} admin`);
    await b.page.goto(`${WEB}/admin?section=verification`, { waitUntil: 'networkidle' });
    const cards = b.page.locator('.admin-verification-item');
    check(`${tag}: Admin > Verification lists both, oldest first`, await shows(cards.nth(1)) && (await cards.count()) === 2
      && (await cards.nth(0).innerText()).includes(other.name) && (await cards.nth(1).innerText()).includes(note));
    const teaCard = cards.filter({ hasText: note });
    check(`${tag}: ...with the link (opens apart, nofollow)`, (await teaCard.getByRole('link', { name: 'https://rangoontea.example' }).getAttribute('rel')) === 'noopener noreferrer nofollow ugc');
    check(`${tag}: Admin: no horizontal scroll`, await layoutOk(b.page));
    await axe(b.page, tag, 'Admin > Verification');
    await b.page.screenshot({ path: path.join(SP, `day106-admin-${c.lang}-${c.theme}.png`), fullPage: true });
    await teaCard.getByRole('button', { name: A.approve, exact: true }).click();
    check(`${tag}: approve: it says so`, await shows(b.page.getByText(fill(A.approved, { name: tea.name }), { exact: true })));
    const otherCard = cards.filter({ hasText: other.name });
    await otherCard.getByRole('combobox').selectOption('not_notable');
    await otherCard.getByRole('button', { name: A.decline, exact: true }).click();
    check(`${tag}: decline with a reason: it says so, nothing left waiting`, await shows(b.page.getByText(fill(A.declinedDone, { name: other.name }), { exact: true }))
      && await shows(b.page.getByText(A.emptyPending, { exact: true })));

    // 3. The tick, as Fay sees it.
    const f = await contextFor(browser, fay, c, `${tag} fay`);
    await f.page.goto(`${WEB}/pages/${tea.id}`, { waitUntil: 'networkidle' });
    const title = f.page.getByRole('heading', { level: 1 });
    check(`${tag}: the page's title has the tick`, await shows(title.getByRole('img', { name: tick, exact: true })) && (await title.innerText()).includes(tea.name));
    await axe(f.page, tag, 'a verified page');
    await f.page.screenshot({ path: path.join(SP, `day106-page-${c.lang}-${c.theme}.png`) });
    await f.page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    const card = f.page.locator('article').filter({ hasText: `Fresh tea today ${c.lang}` }).first();
    check(`${tag}: the page's post in Fay's feed has the tick`, await shows(card) && await shows(card.locator('.post-card-author-row').getByRole('img', { name: tick, exact: true })));
    await f.page.goto(`${WEB}/pages`, { waitUntil: 'networkidle' });
    const row = f.page.locator('.group-row').filter({ hasText: tea.name });
    check(`${tag}: ...and its row in Pages`, await shows(row) && await shows(row.getByRole('img', { name: tick, exact: true })));

    // 4. Olga is told; her pages say where they stand.
    await o.page.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
    const told = stripTags(fill(c.L.notifications.types.pageVerified, { page: tea.name }));
    const declinedText = stripTags(fill(c.L.notifications.types.pageNotVerified, { page: other.name, reason: V.reasons.not_notable }));
    check(`${tag}: Olga is told it's verified`, await shows(o.page.getByRole('link', { name: told })));
    check(`${tag}: ...and why the other was declined`, await shows(o.page.getByRole('link', { name: declinedText })));
    await o.page.getByRole('link', { name: declinedText }).click();
    await o.page.waitForURL(`**/pages/${other.id}/edit`);
    const otherSection = o.page.getByRole('region', { name: V.title, exact: true });
    check(`${tag}: the declined page's Edit page says why and when it can ask again`, await shows(otherSection.getByText(V.declined, { exact: true }))
      && await shows(otherSection.getByText(V.reasons.not_notable, { exact: true }))
      && (await otherSection.innerText()).includes(V.waitUntil.split('{{')[0].trim())
      && (await otherSection.getByRole('button', { name: V.ask, exact: true }).count()) === 0);
    await axe(o.page, tag, 'Edit page, declined');
    await o.page.screenshot({ path: path.join(SP, `day106-declined-${c.lang}-${c.theme}.png`), fullPage: true });
    await o.page.goto(`${WEB}/pages/${tea.id}/edit`, { waitUntil: 'networkidle' });
    check(`${tag}: the verified page's Edit page says so, and warns about renaming at the name`,
      await shows(o.page.getByText(V.verified, { exact: true })) && (await o.page.getByRole('textbox', { name: c.L.pages.name, exact: true }).getAttribute('aria-describedby')) === 'page-name-hint');

    // 5. The admin takes the tick away; the log has every decision.
    await b.page.getByRole('tab', { name: A.tabs.reviewed, exact: true }).click();
    const decided = b.page.locator('.admin-verification-item').filter({ hasText: note });
    await shows(decided);
    await decided.getByRole('combobox').selectOption('impersonation');
    await decided.getByRole('button', { name: A.remove, exact: true }).click();
    const dialog = b.page.getByRole('dialog');
    check(`${tag}: removing a tick asks first`, await shows(dialog) && (await dialog.innerText()).includes(fill(A.removeTitle, { name: tea.name })));
    await dialog.getByRole('button', { name: A.remove, exact: true }).click();
    check(`${tag}: ...then it's gone`, await shows(b.page.getByText(fill(A.removed, { name: tea.name }), { exact: true })) && sql(`SELECT verified_at IS NULL FROM pages WHERE id = ${tea.id}`) === 't');
    await f.page.goto(`${WEB}/pages/${tea.id}`, { waitUntil: 'networkidle' });
    await f.page.getByRole('heading', { level: 1 }).waitFor();
    check(`${tag}: Fay no longer sees a tick`, (await f.page.getByRole('heading', { level: 1 }).getByRole('img', { name: tick, exact: true }).count()) === 0);
    await b.page.goto(`${WEB}/admin?section=log`, { waitUntil: 'networkidle' });
    await b.page.locator('.admin-log-sentence').first().waitFor({ timeout: 8000 }).catch(() => {});
    const logged = (await b.page.locator('.admin-log-sentence').allInnerTexts()).map((t) => t.replace(isolate, ''));
    const S = c.L.admin.log.sentence;
    const want = [
      fill(S.page_unverified, { admin: boss.username, name: tea.name, reason: A.reasons.impersonation }),
      fill(S.page_declined, { admin: boss.username, name: other.name, reason: A.reasons.not_notable }),
      fill(S.page_verified, { admin: boss.username, name: tea.name })
    ];
    check(`${tag}: the log has the three decisions, newest first`, JSON.stringify(logged.slice(0, 3)) === JSON.stringify(want), JSON.stringify(logged.slice(0, 3)));

    await Promise.all([o.ctx.close(), b.ctx.close(), f.ctx.close()]);
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
