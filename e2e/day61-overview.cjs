// Day 61: Admin > Overview (headless Edge, throwaway stack: alice(1) made
// an admin, bob(2)). Overview opens first: totals, what needs attention
// (each shortcut opens its section), and a bar per day for signups /
// posts / comments / reports -- a past day counted from daily_stats,
// today live. 7 / 30 / 90 days; a table of the same numbers. English
// light at 390px and Arabic dark at 375px (newest day on the left), with
// axe and no sideways scroll. bob gets "Not found".
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const LOCALES = {
  en: JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'en.json'), 'utf8')),
  ar: JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'ar.json'), 'utf8'))
};
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };

(async () => {
  sql('UPDATE users SET is_admin = true WHERE id = 1');
  // Three days ago (noon UTC): a signup and 4 posts. Today: a post and a report.
  const noon3 = "((date_trunc('day', now() AT TIME ZONE 'UTC') - interval '3 days' + interval '12 hours') AT TIME ZONE 'UTC')";
  sql(`INSERT INTO users (username, email, password, created_at) VALUES ('olduser', 'olduser@example.com', 'x', ${noon3})`);
  sql(`INSERT INTO posts (user_id, content, created_at) SELECT 2, 'old post', ${noon3} FROM generate_series(1, 4)`);
  // The server counted the finished days when it started (before these
  // back-dated rows existed), and a counted day stays as it is. Forget
  // them so the overview counts again -- real rows are never back-dated.
  sql('DELETE FROM daily_stats');
  const form = new FormData();
  form.append('content', 'Fresh today');
  const fresh = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.bob}` }, body: form })).json();
  await fetch(`${API}/reports`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ targetType: 'post', targetId: fresh.id, reason: 'spam' }) });

  // Today's counts, straight from the database (signups, posts, comments, reports).
  const since = "((now() AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC')";
  const expectToday = ['users', 'posts', 'comments', 'reports'].map((t) => sql(`SELECT count(*) FROM ${t} WHERE created_at >= ${since}`)).join(' ');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    // bob is refused on purpose (404 from the admin API).
    page.on('console', (m) => { if (m.type() === 'error' && !(who === 'bob' && /404/.test(m.text()))) errors.push(`${who}: ${m.text()}`); });
    await page.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
    return page;
  };

  for (const mode of [{ lang: 'en', theme: 'light', width: 390 }, { lang: 'ar', theme: 'dark', width: 375 }]) {
    const tag = `${mode.lang} ${mode.theme} ${mode.width}`;
    const L = (key) => key.split('.').reduce((o, k) => o?.[k], LOCALES[mode.lang]);
    const page = await open('alice', mode);
    const postsChart = page.getByRole('img', { name: new RegExp(`^${L('admin.overview.metric.posts')}`) });
    await postsChart.waitFor({ timeout: 10000 });

    check(`${tag} Overview opens first`, (await page.getByRole('tab', { selected: true }).innerText()).trim() === L('admin.section.overview'));
    const bars = await postsChart.locator('rect').evaluateAll((rs) => rs.map((r) => ({ x: Number(r.getAttribute('x')), h: Number(r.getAttribute('height')), today: r.classList.contains('is-today') })));
    check(`${tag} 30 bars by default, today marked`, bars.length === 30 && bars[29].today, `${bars.length} bars`);
    const tallest = bars.reduce((a, b) => (b.h > a.h ? b : a));
    check(`${tag} the busiest day is 3 days ago (4 old posts)`, tallest === bars[26], `tallest is #${bars.indexOf(tallest)}`);
    const newestLeft = bars[29].x < bars[0].x;
    check(`${tag} newest day on the ${mode.lang === 'ar' ? 'left' : 'right'}`, mode.lang === 'ar' ? newestLeft : !newestLeft);

    // The table has the same numbers.
    await page.getByText(L('admin.overview.showTable')).click();
    const todayRow = (await page.getByRole('row').nth(1).innerText()).replace(/\s+/g, ' ');
    check(`${tag} table: today so far matches the database (${expectToday})`, todayRow === `${L('admin.overview.todaySoFar')} ${expectToday}`, todayRow);
    const row3 = (await page.getByRole('row').nth(4).innerText()).replace(/\s+/g, ' ');
    check(`${tag} table: 3 days ago: 1 signup, 4 posts`, / 1 4 0 0$/.test(row3), row3);

    check(`${tag} no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.waitForTimeout(400);
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${tag} axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
    await page.screenshot({ path: path.join(SP, `day61-overview-${mode.lang}-${mode.theme}-${mode.width}.png`), fullPage: true });

    // 7 days.
    await page.locator('.overview-range-btn').first().click(); // 7 days
    await page.waitForFunction(() => document.querySelector('.overview-chart')?.querySelectorAll('rect').length === 7, null, { timeout: 8000 }).catch(() => {});
    check(`${tag} 7 days: 7 bars`, (await postsChart.locator('rect').count()) === 7);

    // The reports shortcut opens Reports.
    await page.locator('.overview-link').first().click();
    await page.waitForURL(/\/admin\?section=reports$/, { timeout: 8000 }).catch(() => {});
    // The URL changes a moment before the tabs re-render.
    await page.waitForFunction((name) => document.querySelector('.admin-sections [aria-selected="true"]')?.textContent.trim() === name, L('admin.section.reports'), { timeout: 8000 }).catch(() => {});
    const selected = (await page.getByRole('tab', { selected: true }).first().innerText()).trim();
    check(`${tag} the reports shortcut opens Reports (/admin?section=reports)`, selected === L('admin.section.reports') && page.url().endsWith('/admin?section=reports'), `${selected} at ${page.url()}`);
    // Back returns to the Overview.
    await page.goBack();
    await page.locator('.overview-panel').waitFor({ timeout: 8000 }).catch(() => {});
    check(`${tag} Back returns to the Overview`, (await page.locator('.overview-panel').count()) === 1 && page.url().endsWith('/admin'), page.url());
    await page.context().close();
  }

  const bob = await open('bob');
  await bob.getByText(LOCALES.en.admin.notFound).waitFor({ timeout: 8000 }).catch(() => {});
  check('bob (not an admin) sees Not found, and no overview', (await bob.getByText(LOCALES.en.admin.notFound).count()) === 1 && (await bob.locator('.overview-panel').count()) === 0);
  await bob.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
