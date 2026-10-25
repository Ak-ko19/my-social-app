// Day 5 step 3: with no email provider (GET /config -> emailEnabled false)
// the app is honest instead of promising emails that never arrive: the
// verify banner is hidden and forgot-password explains reset is
// unavailable. With email on, both still work. EN/AR (RTL), light/dark,
// 375-430px. Throwaway stack from e2e-up.sh (alice = user 1).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const token = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function newPage({ lang = 'en', theme = 'light', width = 375, loggedIn = false, emailOff = false }) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, l, th, li]) => {
      localStorage.setItem('lang', l); localStorage.setItem('theme', th);
      if (li) {
        localStorage.setItem('token', t); localStorage.setItem('userId', '1');
        localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'false');
      }
    }, [token, lang, theme, loggedIn]);
    const page = await ctx.newPage();
    if (emailOff) {
      await page.route('**/config', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"emailEnabled":false}' }));
    }
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${lang}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
    return page;
  }
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

  // Email OFF: forgot password explains itself, in every language.
  for (const [lang, theme, width] of [['en', 'light', 375], ['en', 'dark', 390], ['ar', 'dark', 430]]) {
    const label = `off ${lang}/${theme}/${width}px`;
    const page = await newPage({ lang, theme, width, emailOff: true });
    await page.goto(`${WEB}/forgot-password`, { waitUntil: 'networkidle' });
    const notice = locale(lang).auth.resetUnavailable;
    await page.getByText(notice).waitFor({ timeout: 5000 }).catch(() => {});
    check(`${label}: forgot-password shows the "unavailable" notice`, (await page.getByText(notice).count()) === 1);
    check(`${label}: no email form to fill in for nothing`, (await page.locator('input[type=email]').count()) === 0);
    check(`${label}: "back to login" still there`, (await page.locator('a[href="/login"]').count()) >= 1);
    check(`${label}: html dir`, (await page.getAttribute('html', 'dir')) === (lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${label}: no horizontal scroll`, await noHScroll(page));
    await page.screenshot({ path: path.join(SP, `day5-forgot-off-${lang}-${theme}-${width}.png`) });
    await page.context().close();
  }

  // Email OFF: an unverified user isn't asked to verify (no banner).
  let page = await newPage({ loggedIn: true, emailOff: true });
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.locator('article.post-card, .feed-empty-state').first().waitFor();
  check('off: verify banner hidden for an unverified user', (await page.locator('.email-verify-banner').count()) === 0);
  check('off: Home works normally', (await page.locator('article.post-card').count()) >= 1);
  await page.context().close();

  // Email ON (the real server): the banner and the reset form still work.
  page = await newPage({ loggedIn: true });
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.locator('.email-verify-banner').waitFor({ timeout: 5000 }).catch(() => {});
  check('on: verify banner shown for an unverified user', (await page.locator('.email-verify-banner').count()) === 1);
  await page.context().close();

  // Day 85: the banner's text and button are readable (AA) in both themes.
  for (const [lang, theme] of [['en', 'light'], ['ar', 'dark']]) {
    const p = await newPage({ loggedIn: true, lang, theme });
    await p.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    await p.locator('.email-verify-banner').waitFor({ timeout: 5000 }).catch(() => {});
    await p.addScriptTag({ content: AXE });
    const r = await p.evaluate(() => window.axe.run('.email-verify-banner', { runOnly: { type: 'rule', values: ['color-contrast'] } }));
    check(`on: the banner passes colour contrast (${lang}/${theme})`, r.violations.length === 0 && r.passes.length > 0,
      r.violations.map((v) => v.nodes.map((n) => n.any[0]?.message).join(' | ')).join(' ; '));
    await p.context().close();
  }

  page = await newPage({});
  await page.goto(`${WEB}/forgot-password`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').fill('alice@example.com');
  await page.locator('form button[type="submit"]').click();
  const sent = page.getByText('If that email exists, a password reset link has been sent');
  await sent.waitFor({ timeout: 5000 }).catch(() => {});
  check('on: forgot-password form sends and confirms', (await sent.count()) === 1);
  await page.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
