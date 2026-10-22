// Day 77: two-factor authentication. A new account turns it on in Settings
// the way a person would -- password, the QR code and its key, a code
// worked out from that key (as the phone's app does), the recovery codes
// -- logs in on another browser through the real form (password, then
// the code), and turns it off again. EN/light: logs in with an app code,
// turns off with a recovery code; AR/dark (RTL): the other way round.
// Throwaway stack from e2e-up.sh.
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const totp = require('../backend/utils/totp');
const EN = require('../frontend/src/i18n/locales/en.json');
const AR = require('../frontend/src/i18n/locales/ar.json');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const PASSWORD = 'a-fine-password-123';
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const json = { 'Content-Type': 'application/json' };
// The wrong code on purpose logs a 400 (and the screen's console.error).
let wrongOnPurpose = false;

const shows = (locator) => locator.waitFor({ timeout: 8000 }).then(() => true, () => false);

async function signup(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  return (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
}

(async () => {
  const dana = await signup('dana2fa');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN, login: 'app', off: 'recovery' }, { lang: 'ar', theme: 'dark', width: 375, L: AR, login: 'recovery', off: 'app' }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const T = c.L.twoFactor;
    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', 'dana2fa');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [dana.token, dana.id, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !wrongOnPurpose) errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

    // Settings -> the new row.
    await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
    await page.getByText(c.L.settings.rows['two-factor'], { exact: true }).click();
    await page.waitForURL(/\/settings\/two-factor$/, { timeout: 8000 }).catch(() => {});
    check(`${tag}: Settings opens Two-factor authentication`, /\/settings\/two-factor$/.test(page.url()), page.url());
    await page.getByRole('heading', { name: T.title }).waitFor({ timeout: 8000 });
    check(`${tag}: it starts off`, await shows(page.getByText(T.off, { exact: true })));
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));

    // Set up: password, then the QR code and the key.
    await page.getByRole('button', { name: T.setUp, exact: true }).click();
    await page.getByLabel(T.password, { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: T.continue, exact: true }).click();
    const qr = page.getByRole('img', { name: T.qrAlt });
    await qr.waitFor({ timeout: 8000 });
    const qrSize = await qr.evaluate((img) => img.complete && img.naturalWidth > 0);
    check(`${tag}: the QR code shows`, qrSize);
    const key = (await page.locator('.two-factor-key').innerText()).replace(/\s/g, '');
    check(`${tag}: the key is shown in groups, left to right`, /^[A-Z2-7]{32}$/.test(key) && (await page.locator('.two-factor-key').getAttribute('dir')) === 'ltr', key);
    check(`${tag}: no horizontal scroll (QR step)`, await noSideScroll());
    await page.screenshot({ path: path.join(SP, `day77-two-factor-qr-${c.lang}-${c.theme}-${c.width}.png`), fullPage: true });

    // A wrong code first: the server's message, in this language.
    wrongOnPurpose = true;
    await page.getByLabel(T.codeLabel, { exact: true }).fill(totp.codeAt(key) === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: T.turnOn, exact: true }).click();
    const alert = page.getByRole('alert');
    await alert.waitFor({ timeout: 8000 }).catch(() => {});
    const alertText = await alert.innerText().catch(() => '');
    wrongOnPurpose = false;
    check(`${tag}: a wrong code is refused in ${c.lang}`, c.lang === 'ar' ? /الرمز غير صحيح/.test(alertText) : /That code is not right/.test(alertText), alertText);

    // The code the phone would show now.
    await page.getByLabel(T.codeLabel, { exact: true }).fill(totp.codeAt(key));
    await page.getByRole('button', { name: T.turnOn, exact: true }).click();
    const list = page.getByRole('list', { name: T.codesTitle });
    await list.waitFor({ timeout: 8000 }).catch(() => {});
    const codes = (await list.innerText().catch(() => '')).split('\n').map((s) => s.trim()).filter(Boolean);
    check(`${tag}: turned on, with 10 recovery codes`, codes.length === 10 && codes.every((x) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(x)), String(codes.length));
    check(`${tag}: codes read left to right`, (await list.getAttribute('dir')) === 'ltr');
    check(`${tag}: no horizontal scroll (codes)`, await noSideScroll());
    await page.screenshot({ path: path.join(SP, `day77-two-factor-codes-${c.lang}-${c.theme}-${c.width}.png`), fullPage: true });
    const status = await (await fetch(`${API}/2fa`, { headers: { Authorization: `Bearer ${dana.token}` } })).json();
    check(`${tag}: the server says it is on`, status.enabled === true && status.recoveryCodesLeft === 10, JSON.stringify(status));

    await page.getByRole('button', { name: T.savedThem, exact: true }).click();
    check(`${tag}: then the screen says On`, await shows(page.getByText(T.on, { exact: true })));

    // Log in on another browser through the real form: password, then the code.
    const other = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await other.addInitScript(([lang, theme]) => { localStorage.setItem('lang', lang); localStorage.setItem('theme', theme); }, [c.lang, c.theme]);
    const lp = await other.newPage();
    lp.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} login: ${m.text()}`); });
    lp.on('pageerror', (e) => errors.push(`${tag} login: ${e.message}`));
    await lp.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
    await lp.getByLabel(c.L.auth.email, { exact: true }).fill('dana2fa@example.com');
    await lp.getByLabel(c.L.auth.password, { exact: true }).fill(PASSWORD);
    await lp.getByRole('button', { name: c.L.auth.logIn, exact: true }).click();
    check(`${tag}: the password leads to the code step`, await shows(lp.getByRole('heading', { name: c.L.auth.twoFactorTitle })));
    check(`${tag}: ...with no session yet`, !(await lp.evaluate(() => localStorage.getItem('token'))));
    check(`${tag}: no horizontal scroll (code step)`, await lp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await lp.screenshot({ path: path.join(SP, `day77-two-factor-login-${c.lang}-${c.theme}-${c.width}.png`) });
    if (c.login === 'recovery') {
      await lp.getByRole('button', { name: c.L.auth.useRecoveryCode, exact: true }).click();
      await lp.getByLabel(c.L.auth.recoveryCodeLabel, { exact: true }).fill(codes[1]);
    } else {
      // The step after the one that turned it on (a code works once).
      await lp.getByLabel(c.L.auth.codeLabel, { exact: true }).fill(totp.codeAt(key, Date.now() + 30000));
    }
    await lp.getByRole('button', { name: c.L.auth.verify, exact: true }).click();
    await lp.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
    check(`${tag}: logged in with ${c.login === 'app' ? 'a code from the app' : 'a recovery code'}`, !!(await lp.evaluate(() => localStorage.getItem('token'))), lp.url());
    if (c.login === 'recovery') {
      check(`${tag}: ...and sent to Two-factor with a notice`, lp.url().endsWith('/settings/two-factor') && await shows(lp.getByText(T.recoveryLogin)), lp.url());
    }
    await other.close();

    // Turn it off again.
    await page.getByRole('button', { name: T.turnOff, exact: true }).click();
    await page.getByLabel(T.password, { exact: true }).fill(PASSWORD);
    if (c.off === 'recovery') {
      await page.getByRole('button', { name: T.useRecovery, exact: true }).click();
      await page.getByLabel(T.recoveryLabel, { exact: true }).fill(codes[0]);
    } else {
      // The step after the one that turned it on (the login used a recovery code).
      await page.getByLabel(T.codeLabel, { exact: true }).fill(totp.codeAt(key, Date.now() + 30000));
    }
    await page.locator('form').getByRole('button', { name: T.turnOff, exact: true }).click();
    const done = page.getByRole('status');
    await done.waitFor({ timeout: 8000 }).catch(() => {});
    check(`${tag}: turned off with ${c.off === 'app' ? 'a code from the app' : 'a recovery code'}`, (await done.innerText().catch(() => '')) === T.turnedOff);
    const after = await (await fetch(`${API}/2fa`, { headers: { Authorization: `Bearer ${dana.token}` } })).json();
    check(`${tag}: the server says it is off`, after.enabled === false, JSON.stringify(after));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
