// Day 8 step 2: Settings -> "Where you're logged in": lists this device +
// the others, logs one out, logs all the others out, and Settings -> Log
// Out ends this session on the server too. EN light, AR dark RTL 375px,
// MY. Throwaway stack from e2e-up.sh (alice = user 1).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const { PSQL } = require('./pg.cjs');
const PASSWORD = 'a-fine-password-123';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WIN_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

const apiLogin = async (userAgent) => (await (await fetch(`${API}/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent },
  body: JSON.stringify({ email: 'alice@example.com', password: PASSWORD })
})).json()).token;
const status = async (token) => (await fetch(`${API}/profile/me`, { headers: { Authorization: `Bearer ${token}` } })).status;
const sidOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sid;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function newPage({ lang = 'en', theme = 'light', width = 390 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([l, th]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('lang', l); localStorage.setItem('theme', th); sessionStorage.setItem('seeded', '1');
      }
    }, [lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${lang}: ${m.text()}`); });
    // Which request got a 401 (the console line doesn't say).
    page.on('response', (r) => { if (r.status() === 401) errors.push(`${lang}: 401 from ${r.request().method()} ${r.url()} (${page.url()})`); });
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
    return page;
  }
  async function uiLogin(page) {
    await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type=email]').fill('alice@example.com');
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(`${WEB}/`);
  }
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

  // ---- EN, light: the full flow ----
  const EN = locale('en');
  const phone = await apiLogin(IPHONE);
  const laptop = await apiLogin(WIN_EDGE);
  sql(`UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE id = '${sidOf(phone)}'`);
  let page = await newPage();
  await uiLogin(page);
  await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: EN.settings.rows.sessions }).click();
  await page.waitForURL(`${WEB}/settings/sessions`);
  const rows = page.locator('li.sessions-row:not(.sessions-skeleton)');
  await rows.first().waitFor();
  // Device names carry invisible bidi isolates (U+2068/U+2069); compare
  // without them.
  const texts = (await rows.allInnerTexts()).map((t) => t.replace(/[⁦-⁩]/g, ''));
  const expectedRows = sql("SELECT count(*) FROM sessions WHERE user_id = 1 AND revoked_at IS NULL AND expires_at > now()");
  check('lists every active session', texts.length === Number(expectedRows), `${texts.length} rows, ${expectedRows} in DB`);
  check('this device first, marked "This device"', texts[0].includes(EN.sessions.thisDevice) && texts[0].includes(EN.sessions.activeNow));
  check('the phone: "Safari on iOS", last active 2h ago', texts.some((t) => t.includes('Safari on iOS') && t.includes('Last active 2h ago')));
  check('the laptop: "Edge on Windows"', texts.some((t) => t.includes('Edge on Windows')));
  check('no Log out button on this device', (await rows.first().locator('button').count()) === 0);
  await page.screenshot({ path: path.join(SP, 'day8-sessions-en-light.png') });

  // Log out the phone.
  const SAFARI_IOS = /Safari⁩? on ⁨?iOS/;
  const phoneRow = rows.filter({ hasText: SAFARI_IOS });
  await phoneRow.getByRole('button', { name: /Log out/ }).click();
  await phoneRow.waitFor({ state: 'detached' });
  check('logging out one device removes it', (await rows.filter({ hasText: SAFARI_IOS }).count()) === 0);
  check('...and that device is signed out', (await status(phone)) === 401);
  check('...the others are not', (await status(laptop)) === 200);

  // Log out all the others.
  await page.getByRole('button', { name: EN.sessions.logOutOthers }).click();
  await page.getByRole('button', { name: EN.sessions.confirm, exact: true }).last().click();
  await page.getByText(EN.sessions.loggedOutOthers).waitFor();
  check('"log out of all other devices" leaves only this one', (await rows.count()) === 1 && (await rows.first().innerText()).includes(EN.sessions.thisDevice));
  check('...the laptop is signed out', (await status(laptop)) === 401);
  check('this device still works', (await page.evaluate(async (api) => (await fetch(`${api}/profile/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })).status, API)) === 200);

  // Settings -> Log Out ends the session on the server too.
  const mySid = sidOf(await page.evaluate(() => localStorage.getItem('token')));
  await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: EN.settings.logOut }).click();
  await page.waitForURL(/\/login/);
  const revoked = sql(`SELECT revoked_at IS NOT NULL FROM sessions WHERE id = '${mySid}'`);
  check('Settings -> Log Out also ends the session on the server', revoked === 't');
  await page.context().close();

  // ---- AR dark 375 and MY: translated, RTL, fits ----
  for (const [lang, theme, width] of [['ar', 'dark', 375], ['my', 'light', 390]]) {
    const L = locale(lang);
    await apiLogin(IPHONE);
    page = await newPage({ lang, theme, width });
    await uiLogin(page);
    await page.goto(`${WEB}/settings/sessions`, { waitUntil: 'networkidle' });
    await page.locator('li.sessions-row:not(.sessions-skeleton)').first().waitFor();
    // exact: "this device" also appears inside the Myanmar intro sentence.
    check(`${lang}: title and "this device" translated`, (await page.getByRole('heading', { name: L.sessions.title }).count()) === 1
      && (await page.getByText(L.sessions.thisDevice, { exact: true }).count()) === 1);
    if (lang === 'ar') {
      // "Safari على iOS" must READ right-to-left: the browser name to the
      // right of the system name (it used to render the other way round).
      const order = await page.locator('.sessions-device', { hasText: 'Safari' }).first().evaluate((el) => {
        const text = el.firstChild;
        const node = text.firstChild;
        const box = (word) => {
          const i = node.textContent.indexOf(word);
          const r = document.createRange();
          r.setStart(node, i); r.setEnd(node, i + word.length);
          return r.getBoundingClientRect().left;
        };
        return { safari: box('Safari'), ios: box('iOS') };
      });
      check('ar: "Safari on iOS" reads right-to-left (Safari right of iOS)', order.safari > order.ios, JSON.stringify(order));
    }
    check(`${lang}: html dir`, (await page.getAttribute('html', 'dir')) === (lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${lang}: no horizontal scroll`, await noHScroll(page));
    check(`${lang}: log-out buttons have an accessible name`, (await page.locator('.sessions-logout-btn').evaluateAll((els) => els.every((e) => e.getAttribute('aria-label')))));
    await page.screenshot({ path: path.join(SP, `day8-sessions-${lang}-${theme}-${width}.png`) });
    await page.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
