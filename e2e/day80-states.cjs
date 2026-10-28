// Day 80: empty, error and offline states on every screen. A brand-new
// account (nothing posted, followed, saved...) opens each route three ways:
//   empty   -- as it is: the screen must say something (not a blank area);
//   error   -- every API read answers 500: a message (role=alert or
//              status) and a way to try again;
//   offline -- the network goes away while the app is open, then the route
//              is opened inside the app, before and after its code was
//              downloaded: the offline banner, and a message or saved
//              content (never a blank screen or the crash screen).
// STATES_REPORT=1 prints what each screen shows instead of failing.
// Throwaway stack from e2e-up.sh.

const { chromium } = require('./node_modules/playwright-core');

const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const PASSWORD = 'a-fine-password-123';
const REPORT = process.env.STATES_REPORT === '1';
// English and Arabic (RTL), each with its own new account; STATES_LANG=ar
// runs one.
const LANGS = process.env.STATES_LANG ? [process.env.STATES_LANG] : ['en', 'ar'];

// Screens that show a list or data loaded from the API.
const ROUTES = [
  '/', '/notifications', '/messages', '/messages/archived', '/search', '/explore', '/saved', '/saved/collections/1', '/drafts', '/drafts?tab=scheduled',
  '/activity', '/activity?tab=comments', '/activity?tab=searches', '/groups', '/pages', '/events', '/hashtag/welcome',
  '/profile/me', '/profile/2', '/profile/2/connections?tab=followers', '/profile/2/connections?tab=following',
  '/settings/sessions', '/settings/blocked-users', '/settings/follow-requests', '/settings/muted', '/settings/hashtags', '/settings/restricted',
  '/settings/close-friends', '/settings/hidden-words', '/settings/notifications', '/settings/interactions', '/settings/two-factor',
  '/posts/1', '/groups/1', '/pages/1', '/events/1', '/messages/1', '/memories'
];

const results = [];
const report = [];
const errors = [];
const checkAll = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

async function newAccount(name) {
  const json = { 'Content-Type': 'application/json' };
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const login = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: { Authorization: `Bearer ${login.token}` } });
  return login;
}

// What the screen says below its header: the text of everything except the
// top bar, the tab bar and the offline banner.
const screenText = (page) => page.evaluate(() => {
  const root = document.querySelector('.phone-shell, #root') || document.body;
  const clone = root.cloneNode(true);
  clone.querySelectorAll('header, nav, .bottom-tab-bar, .offline-banner, [hidden]').forEach((n) => n.remove());
  return clone.innerText.replace(/\s+/g, ' ').trim();
});
const hasRetry = (page) => page.getByRole('button', { name: /try again|retry|إعادة المحاولة|حاول مرة أخرى/i }).count().then((n) => n > 0);
const hasMessage = (page) => page.locator('[role=alert], [role=status]:not(.offline-banner)').filter({ hasText: /\S/ }).count().then((n) => n > 0);

async function runLanguage(browser, LANG) {
  const check = (name, ok, extra) => checkAll(`${LANG}: ${name}`, ok, extra);
  const me = await newAccount(`evan80${LANG}`);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(([t, id, lang]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', `evan80${lang}`);
    localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang);
    // Arabic runs in the dark theme, English in the light one.
    localStorage.setItem('theme', lang === 'ar' ? 'dark' : 'light');
  }, [me.token, me.id, LANG]);

  for (const route of ROUTES) {
    // 1. Empty: the new account as it is.
    {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${LANG} ${route} empty: ${e.message}`));
      await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const text = await screenText(page);
      report.push(`${LANG} EMPTY   ${route.padEnd(40)} ${text.slice(0, 110)}`);
      check(`${route}: says something when there's nothing to show`, text.length >= 10, text.slice(0, 80));
      await page.close();
    }
    // 2. Error: every API read fails.
    {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${LANG} ${route} error: ${e.message}`));
      await page.route(`${API}/**`, (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 500, contentType: 'text/plain', body: 'Server error' }) : r.continue()));
      await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const [message, retry, text] = [await hasMessage(page), await hasRetry(page), await screenText(page)];
      report.push(`${LANG} ERROR   ${route.padEnd(40)} message=${message} retry=${retry} | ${text.slice(0, 80)}`);
      check(`${route}: a failed load says so and offers to try again`, message && retry, text.slice(0, 80));
      await page.close();
    }
    // 3. Offline, in the app: "cold" -- the screen's code was never
    // downloaded (it says so and waits for the connection); "warm" -- the
    // screen was open before, so its own failed loads must say something.
    for (const warm of [false, true]) {
      const mode = warm ? 'offline (warm)' : 'offline (cold)';
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${LANG} ${route} ${mode}: ${e.message}`));
      if (warm) {
        await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')); });
        await page.waitForTimeout(400);
      } else {
        await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
      }
      await context.setOffline(true);
      await page.evaluate((r) => { window.history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')); }, route);
      await page.waitForTimeout(1500);
      const banner = await page.locator('.offline-banner').isVisible().catch(() => false);
      const crashed = (await page.locator('.error-boundary').count()) > 0;
      const [message, text] = [await hasMessage(page), await screenText(page)];
      report.push(`${LANG} ${mode.padEnd(15)} ${route.padEnd(40)} banner=${banner} message=${message} crashed=${crashed} | ${text.slice(0, 70)}`);
      check(`${route}: ${mode} shows the banner and a message or saved content, never the crash screen`,
        banner && !crashed && (message || text.length >= 10), text.slice(0, 80));
      await context.setOffline(false);
      await page.close();
    }
  }
  // The specific fixes of Day 80.
  const L = require(`../frontend/src/i18n/locales/${LANG}.json`);
  {
    // A chat you're not in: the notice and the way back -- no failed-load
    // error, no composer.
    const page = await context.newPage();
    await page.goto(`${WEB}/messages/1`, { waitUntil: 'networkidle' });
    const notice = page.getByRole('alert').filter({ hasText: L.messages.noLongerMember });
    check('a chat you are not in: only the notice', await notice.isVisible().catch(() => false)
      && (await page.getByRole('textbox', { name: L.messages.writeMessage || /message/i }).count()) === 0
      && (await page.getByRole('button', { name: L.common.retry }).count()) === 0);
    check('...and the way back to Messages', (await page.getByRole('link', { name: L.messages.backToMessages }).count()) === 1);
    await page.screenshot({ path: `${__dirname}/day80-states-chat-${LANG}.png` });
    await page.close();
  }
  {
    // A page that isn't there: no pointless Try again, a way back instead.
    const page = await context.newPage();
    await page.goto(`${WEB}/pages/999999`, { waitUntil: 'networkidle' });
    check('a missing page: says so, with no Try again', await page.getByText(L.pages.unavailable).isVisible().catch(() => false)
      && (await page.getByRole('button', { name: L.common.retry }).count()) === 0);
    check('...and a way back to Pages', (await page.getByRole('link', { name: L.pages.backToPages }).count()) === 1);
    await page.screenshot({ path: `${__dirname}/day80-states-page-${LANG}.png` });
    await page.close();
  }
  {
    // Offline, a list that failed says why, and loads by itself once back online.
    const page = await context.newPage();
    await page.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
    await page.evaluate(() => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForTimeout(500); // Notifications has really left the screen
    await context.setOffline(true);
    await page.evaluate(() => { window.history.pushState({}, '', '/notifications'); window.dispatchEvent(new PopStateEvent('popstate')); });
    const offlineLine = page.getByRole('alert').filter({ hasText: L.errors.offlineRetry });
    check('offline: a failed list says you are offline', await offlineLine.waitFor({ timeout: 8000 }).then(() => true, () => false));
    await page.screenshot({ path: `${__dirname}/day80-states-offline-${LANG}.png` });
    await context.setOffline(false);
    check('...and loads by itself when back online', await offlineLine.waitFor({ state: 'detached', timeout: 10000 }).then(() => true, () => false)
      && (await page.getByRole('alert').count()) === 0);
    await page.close();
  }

  await context.close();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const lang of LANGS) await runLanguage(browser, lang);
  await browser.close();
  if (REPORT) console.log(report.join('\n') + '\n');
  console.log(results.join('\n'));
  console.log('\npage errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(!REPORT && (results.some((r) => r.startsWith('FAIL')) || errors.length) ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });



