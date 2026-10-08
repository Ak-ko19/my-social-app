// Day 47: privacy controls (headless Edge, throwaway stack: alice(1),
// bob(2)). Step 1, mute: alice follows bob, sees his post on Home, mutes
// him from the post's menu -- it leaves Home at once and stays gone after a
// reload; his profile and post still open, the profile says Unmute;
// Settings > Muted accounts lists him and unmutes. Arabic (RTL) + dark at
// 375px with axe. Bob is never told.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const AR = JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'ar.json'), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
const api = (who, method, url, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${tokens[who]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined
});

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const axe = async (page, label) => {
    await page.waitForTimeout(400); // the screen-enter animation
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document.querySelector('.screen-enter'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }));
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };
  const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // ---- Step 1: mute ----
  await api('alice', 'POST', '/users/2/follow');
  const form = new FormData();
  form.append('content', 'Bob posts a lot today');
  const bobPost = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.bob}` }, body: form })).json();
  const bobCard = (page) => page.locator('article.post-card', { hasText: 'Bob posts a lot today' });

  const alice = await open('alice', '/');
  await bobCard(alice).waitFor({ timeout: 10000 }).catch(() => {});
  check("bob's post is on alice's Home", (await bobCard(alice).count()) === 1);
  await bobCard(alice).getByRole('button', { name: 'More options' }).click();
  await alice.getByRole('menuitem', { name: 'Mute bob' }).click();
  await bobCard(alice).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  check('"Mute bob" takes his post off Home at once', (await bobCard(alice).count()) === 0);
  await alice.reload({ waitUntil: 'networkidle' });
  await alice.locator('article.post-card, .feed-empty, [role=status]').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('...and it stays off after a reload', (await bobCard(alice).count()) === 0);
  await alice.goto(`${WEB}/posts/${bobPost.id}`, { waitUntil: 'networkidle' });
  check('the post itself still opens', (await bobCard(alice).count()) === 1);
  await alice.goto(`${WEB}/profile/2`, { waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: 'More options' }).first().click();
  check('his profile offers "Unmute bob"', (await alice.getByRole('menuitem', { name: 'Unmute bob' }).count()) === 1);
  await alice.keyboard.press('Escape');
  check('bob is never told: nothing but the follow notification', sql("SELECT string_agg(type, ',') FROM notifications WHERE user_id = 2") === 'follow');

  await alice.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: /Muted accounts/ }).click();
  await alice.waitForURL(`${WEB}/settings/muted`, { timeout: 8000 }).catch(() => {});
  await alice.getByText('bob', { exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Settings > Muted accounts lists bob', (await alice.getByRole('button', { name: 'Unmute bob' }).count()) === 1);
  await axe(alice, 'en/light, Muted accounts');
  await alice.getByRole('button', { name: 'Unmute bob' }).click();
  await alice.getByText(/You haven't muted anyone/).waitFor({ timeout: 8000 }).catch(() => {});
  check('unmute from the list', (await alice.getByText(/You haven't muted anyone/).count()) === 1 && sql('SELECT COUNT(*) FROM user_mutes') === '0');
  await alice.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await bobCard(alice).waitFor({ timeout: 8000 }).catch(() => {});
  check("...and bob's post is back on Home", (await bobCard(alice).count()) === 1);
  await alice.context().close();

  // Arabic, dark, 375px: mute from the profile, then the list.
  const ar = await open('alice', '/profile/2', { lang: 'ar', theme: 'dark', width: 375 });
  await ar.getByRole('button', { name: AR.postMenu.moreOptions }).first().click();
  await ar.getByRole('menuitem', { name: AR.muted.muteName.replace('{{name}}', 'bob') }).click();
  await ar.getByRole('status').filter({ hasText: 'bob' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: muting from the profile says what it does, in Arabic', (await ar.getByText(AR.muted.mutedNote.replace('{{name}}', 'bob')).count()) === 1);
  await ar.goto(`${WEB}/settings/muted`, { waitUntil: 'networkidle' });
  await ar.getByRole('button', { name: AR.muted.unmuteName.replace('{{name}}', 'bob') }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: the list is right-to-left and translated', (await ar.evaluate(() => document.documentElement.dir)) === 'rtl'
    && (await ar.getByRole('heading', { name: AR.muted.title }).count()) === 1);
  check('ar: no sideways scroll at 375px', await noSideScroll(ar));
  await axe(ar, 'ar/dark, Muted accounts');
  await ar.screenshot({ path: path.join(SP, 'day47-muted-ar-dark-375.png') });
  await ar.context().close();
  await api('alice', 'DELETE', '/users/2/mute');

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
