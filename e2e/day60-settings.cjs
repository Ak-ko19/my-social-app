// Day 60 (AUDIT_REPORT_3 A2): Settings has no dead rows left but the
// paused features (headless Edge, throwaway stack: alice(1)).
// Followers & Following opens your own connections; Help & Support and
// About open their pages -- in English light at 390px and Arabic dark at
// 375px, with axe, right-to-left, and no sideways scroll. Both pages are
// public, like Terms.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const LOCALES = {
  en: JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'en.json'), 'utf8')),
  ar: JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'ar.json'), 'utf8'))
};
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const mode of [{ lang: 'en', theme: 'light', width: 390 }, { lang: 'ar', theme: 'dark', width: 375 }]) {
    const tag = `${mode.lang} ${mode.theme} ${mode.width}`;
    const L = (key) => key.split('.').reduce((o, k) => o?.[k], LOCALES[mode.lang]);
    const row = (key) => L('settings.rows')[key];
    const ctx = await browser.newContext({ viewport: { width: mode.width, height: 844 } });
    await ctx.addInitScript(([t, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [aliceToken, mode.theme, mode.lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });

    const axe = async (label) => {
      await page.waitForTimeout(400); // the screen-enter animation
      await page.evaluate(AXE);
      const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      check(`${tag} ${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
    };
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const openSettings = async () => {
      await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: row('about') }).waitFor({ timeout: 10000 });
    };

    // 1. Settings: only the paused features are disabled.
    await openSettings();
    const disabled = await page.locator('button.settings-row[disabled]').allInnerTexts();
    check(`${tag} Settings: only Reels and Live are disabled`, JSON.stringify(disabled.map((s) => s.trim())) === JSON.stringify([row('reels-videos'), row('live-streaming')]), JSON.stringify(disabled));
    check(`${tag} Settings: page direction is ${mode.lang === 'ar' ? 'rtl' : 'ltr'}`, (await page.evaluate(() => document.documentElement.dir)) === (mode.lang === 'ar' ? 'rtl' : 'ltr'));

    // 2. Followers & Following -> your own connections, on Followers.
    await page.getByRole('button', { name: row('followers-following') }).click();
    await page.waitForURL(/\/profile\/1\/connections\?tab=followers$/, { timeout: 8000 }).catch(() => {});
    check(`${tag} Followers & Following opens your connections on Followers`, /\/profile\/1\/connections\?tab=followers$/.test(page.url()), page.url());
    check(`${tag} ...with the Followers tab selected`, (await page.getByRole('tab', { selected: true }).innerText().catch(() => '')).includes(L('connections.tabs.followers')), await page.getByRole('tab', { selected: true }).innerText().catch(() => ''));

    // 3. Help & Support.
    await openSettings();
    await page.getByRole('button', { name: row('help-support') }).click();
    await page.getByRole('heading', { level: 1, name: L('help.title') }).waitFor({ timeout: 8000 }).catch(() => {});
    check(`${tag} Help opens with its title`, (await page.getByRole('heading', { level: 1, name: L('help.title') }).count()) === 1);
    check(`${tag} ...and all 8 answers`, (await page.getByRole('heading', { level: 2 }).count()) === 8);
    check(`${tag} ...no sideways scroll`, await fits());
    await axe('Help');
    await page.getByRole('link', { name: L('help.toAbout') }).click();

    // 4. About (reached from Help).
    await page.getByRole('heading', { level: 1, name: L('about.title') }).waitFor({ timeout: 8000 }).catch(() => {});
    check(`${tag} Help links to About`, (await page.getByRole('heading', { level: 1, name: L('about.title') }).count()) === 1);
    const links = await page.getByRole('navigation', { name: L('about.linksLabel') }).getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    check(`${tag} About links Terms, Privacy and Help`, JSON.stringify(links) === JSON.stringify(['/terms', '/privacy', '/help']), JSON.stringify(links));
    check(`${tag} ...the brand name stays left-to-right`, (await page.locator('.ui-logo-wordmark').first().getAttribute('dir')) === 'ltr');
    check(`${tag} ...no sideways scroll`, await fits());
    await axe('About');
    if (mode.lang === 'ar') {
      const start = await page.locator('.about-links a').first().evaluate((a) => {
        const r = a.getBoundingClientRect();
        return { right: Math.round(window.innerWidth - r.right), left: Math.round(r.left) };
      });
      check(`${tag} About links start on the right in Arabic`, start.right < start.left, JSON.stringify(start));
    }
    await page.screenshot({ path: path.join(SP, `day60-about-${mode.lang}-${mode.theme}-${mode.width}.png`) });
    await ctx.close();
  }

  // 5. Public, like Terms: logged out, both open (no redirect to login).
  const anon = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  for (const route of ['/help', '/about']) {
    await anon.goto(WEB + route, { waitUntil: 'networkidle' });
    check(`logged out: ${route} opens (no login needed)`, new URL(anon.url()).pathname === route && (await anon.getByRole('heading', { level: 1 }).count()) === 1, anon.url());
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
