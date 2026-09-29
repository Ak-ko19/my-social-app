// Day 8 step 1: changing the password in Settings signs out the OTHER
// devices (sent back to login), keeps this one signed in, and a mistyped
// current password no longer logs you out. EN light + AR (RTL) dark.
// Throwaway stack from e2e-up.sh (alice = user 1, password below).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const PASSWORD = 'a-fine-password-123';
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const login = async (password) => (await (await fetch(`${API}/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'alice@example.com', password })
})).json()).token;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function device(token, { lang = 'en', theme = 'light', width = 390, expectErrors = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, l, th]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
        localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', l); localStorage.setItem('theme', th);
        sessionStorage.setItem('seeded', '1'); // seed once, so a sign-out isn't undone on reload
      }
    }, [token, lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (expectErrors && expectErrors.test(m.text())) return;
      if (page.allowNow && page.allowNow.test(m.text())) return; // a step that expects it
      errors.push(`${lang}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
    return page;
  }
  async function changePassword(page, current, next) {
    // exact: label matching is by substring ("New password" is inside
    // "Confirm new password").
    await page.getByLabel(locale(page.lang).account.currentPassword, { exact: true }).fill(current);
    await page.getByLabel(locale(page.lang).account.newPassword, { exact: true }).fill(next);
    await page.getByLabel(locale(page.lang).account.confirmPassword, { exact: true }).fill(next);
    await page.locator('form.account-mgmt-form button[type=submit]').click();
  }

  for (const [lang, theme, oldPw, newPw] of [['en', 'light', PASSWORD, 'new-password-en-1'], ['ar', 'dark', 'new-password-en-1', 'new-password-ar-2']]) {
    const L = locale(lang).account;
    const a = await device(await login(oldPw), { lang, theme });
    a.lang = lang;
    // Device B: its requests start failing with 401 once signed out.
    const b = await device(await login(oldPw), { lang, theme, expectErrors: /401|Unauthorized/ });
    await b.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    check(`${lang}: device B starts signed in`, !b.url().includes('/login'));

    await a.goto(`${WEB}/settings/account`, { waitUntil: 'networkidle' });
    // A mistyped current password: an error, and still signed in. The 403
    // it answers is expected (only during this step).
    a.allowNow = /403|Forbidden/;
    await changePassword(a, 'not-my-password', newPw);
    await a.locator('.account-mgmt-error').waitFor();
    await a.waitForTimeout(300);
    a.allowNow = null;
    check(`${lang}: wrong current password shows an error`, (await a.locator('.account-mgmt-error').innerText()).length > 0);
    await a.waitForTimeout(500);
    check(`${lang}: ...and does not log you out`, a.url().endsWith('/settings/account') && Boolean(await a.evaluate(() => localStorage.getItem('token'))));

    await changePassword(a, oldPw, newPw);
    await a.getByRole('status').filter({ hasText: L.passwordChanged }).waitFor();
    check(`${lang}: success says the other devices were signed out`, true, L.passwordChanged);
    check(`${lang}: html dir`, (await a.getAttribute('html', 'dir')) === (lang === 'ar' ? 'rtl' : 'ltr'));
    await a.screenshot({ path: path.join(SP, `day8-password-changed-${lang}-${theme}.png`) });

    // Device A keeps working...
    await a.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    check(`${lang}: this device stays signed in`, !a.url().includes('/login') && (await a.locator('article.post-card, .feed-empty-state').count()) >= 1);
    // ...device B is sent back to the login screen.
    await b.goto(`${WEB}/notifications`);
    await b.waitForURL(/\/login/, { timeout: 8000 }).catch(() => {});
    check(`${lang}: the other device is sent to login`, b.url().includes('/login'), b.url());
    await a.context().close();
    await b.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
