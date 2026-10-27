// Day 105: "Finish your profile" on Home. A new account (first-run steps
// done) sees "0 of 4 done" with four steps. "Write a bio" opens Edit
// profile with the bio field focused; after saving a bio, Home says "1 of 4
// done" and the bio is ticked. "Add a link" focuses the first link field.
// "Don't show again" hides it, and it stays hidden after a reload (kept on
// the server). axe on the card. EN/light 390 px and AR/dark 375 px (RTL).
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

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const P = c.L.profileCard;
    const ana = await account(`ana105${c.lang}`);

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [ana.token, ana.id, ana.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    await page.goto(WEB, { waitUntil: 'networkidle' });
    const card = page.getByRole('region', { name: P.title });
    check(`${tag}: Home shows "Finish your profile", 0 of 4`, await shows(card) && (await card.innerText()).includes(fill(P.progress, { done: 0, total: 4 })));
    check(`${tag}: ...four steps, each a link`, (await card.getByRole('link').count()) === 4);
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.waitForTimeout(400);
    await page.addScriptTag({ content: AXE });
    const bad = (await page.evaluate(() => window.axe.run('.profile-card'))).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${tag}: axe finds nothing serious on the card`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`).join(' | '));
    await card.screenshot({ path: path.join(SP, `day105-card-${c.lang}-${c.theme}.png`) });

    // Write a bio: Edit profile, the bio focused.
    await card.getByRole('link', { name: P.todo.bio, exact: true }).click();
    await page.waitForURL('**/edit-profile?focus=bio', { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-focus') === 'bio', null, { timeout: 8000 }).catch(() => {});
    check(`${tag}: "Write a bio" opens Edit profile with the bio focused`, await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'));
    await page.keyboard.type(c.lang === 'en' ? 'Tea lover from Yangon' : 'محبة للشاي');
    await page.getByRole('button', { name: c.L.common.saveChanges, exact: true }).click();
    await page.waitForTimeout(800);
    check(`${tag}: ...saved`, sql(`SELECT bio IS NOT NULL AND bio <> '' FROM users WHERE id = ${ana.id}`) === 't');

    await page.goto(WEB, { waitUntil: 'networkidle' });
    check(`${tag}: back on Home: 1 of 4, the bio ticked`, await shows(card) && (await card.innerText()).includes(fill(P.progress, { done: 1, total: 4 }))
      && (await card.getByRole('link').count()) === 3 && (await card.innerText()).includes(P.done.bio));

    // Add a link: the first link field focused.
    await card.getByRole('link', { name: P.todo.links, exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-focus') === 'links', null, { timeout: 8000 }).catch(() => {});
    check(`${tag}: "Add a link" focuses the first link field`, await page.evaluate(() => document.activeElement?.getAttribute('data-focus') === 'links'));

    // Don't show again: gone, and still gone after a reload.
    await page.goto(WEB, { waitUntil: 'networkidle' });
    await card.getByRole('button', { name: P.dismiss, exact: true }).click();
    check(`${tag}: "Don't show again" hides it`, await card.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false));
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    check(`${tag}: ...and it stays hidden after a reload`, (await card.count()) === 0
      && sql(`SELECT profile_card_dismissed_at IS NOT NULL FROM users WHERE id = ${ana.id}`) === 't');
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
