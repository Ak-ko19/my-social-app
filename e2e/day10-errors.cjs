// Day 10 step 1: a crash shows a friendly translated screen (not a white
// page) and lands in the admin error log, where an admin can read and
// resolve it. Needs the PRODUCTION build (browser error reporting is off
// in dev): run-all.sh starts this one with E2E_FRONTEND=dist.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const { PSQL } = require('./pg.cjs');
const token = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  sql('UPDATE users SET is_admin = true WHERE id = 1');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function newPage({ lang = 'en', theme = 'light', width = 390, allow = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, l, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', l); localStorage.setItem('theme', th);
    }, [token, lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !(allow && allow.test(m.text()))) errors.push(`${lang}: ${m.text()}`); });
    page.on('pageerror', (e) => { if (!(allow && allow.test(e.message))) errors.push(`${lang}: ${e.message}`); });
    return page;
  }
  // The feed API answering malformed data (posts is not a list) makes Home
  // throw while rendering: exactly the white-screen case.
  async function crashHome(page) {
    await page.route('**/feed?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"posts":"not a list","hasMore":false}' }));
    const reported = page.waitForRequest((r) => r.url().endsWith('/client-errors') && r.method() === 'POST', { timeout: 10000 }).catch(() => null);
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    return reported;
  }
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  // React logs the caught render error to the console on purpose.
  const CRASH_NOISE = /Cannot read properties of undefined|not a function|The above error occurred|ErrorBoundary|Uncaught/;

  // ---- EN: the crash screen + the report ----
  const EN = locale('en');
  let page = await newPage({ allow: CRASH_NOISE });
  const request = await crashHome(page);
  await page.getByRole('heading', { name: EN.errorBoundary.title }).waitFor({ timeout: 8000 }).catch(() => {});
  check('a render crash shows the friendly screen, not a blank page', (await page.getByRole('heading', { name: EN.errorBoundary.title }).count()) === 1);
  check('...with Reload and Home buttons', (await page.getByRole('button', { name: EN.errorBoundary.reload }).count()) === 1
    && (await page.getByRole('button', { name: EN.errorBoundary.home }).count()) === 1);
  check('the crash is reported to the backend', Boolean(request));
  const body = request ? JSON.parse(request.postData()) : {};
  check('...as a render error, page path only', body.kind === 'render' && body.url === '/', JSON.stringify({ kind: body.kind, url: body.url }));
  await page.waitForTimeout(500);
  const stored = sql("SELECT source || '|' || route || '|' || count FROM error_groups WHERE source = 'client'");
  check('...and stored in the error log', /^client\|render \/\|1$/.test(stored), stored);
  await page.screenshot({ path: path.join(SP, 'day10-crash-en-light.png') });
  // "Go to Home" (without the broken API) recovers.
  await page.unroute('**/feed?*');
  await page.getByRole('button', { name: EN.errorBoundary.home }).click();
  await page.locator('article.post-card, .feed-empty-state').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('"Go to Home" recovers once the problem is gone', (await page.locator('article.post-card').count()) >= 1);
  await page.context().close();

  // ---- AR dark 375: the crash screen is translated and right-to-left ----
  const AR = locale('ar');
  page = await newPage({ lang: 'ar', theme: 'dark', width: 375, allow: CRASH_NOISE });
  await crashHome(page);
  await page.getByRole('heading', { name: AR.errorBoundary.title }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: crash screen translated', (await page.getByRole('heading', { name: AR.errorBoundary.title }).count()) === 1);
  check('ar: right-to-left', (await page.getAttribute('html', 'dir')) === 'rtl');
  check('ar: no horizontal scroll', await noHScroll(page));
  await page.screenshot({ path: path.join(SP, 'day10-crash-ar-dark-375.png') });
  await page.context().close();
  // Within 10 s of the first, so the server holds it back and writes it when
  // its 10 s write window ends: poll for up to 15 s.
  let grouped = '';
  for (let i = 0; i < 30 && grouped !== '1|2'; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    grouped = sql("SELECT count(*) || '|' || max(count) FROM error_groups WHERE source = 'client'");
  }
  check('the same crash again is one group with a count, not a new row', grouped === '1|2', grouped);

  // ---- Admin: read and resolve it ----
  page = await newPage();
  await page.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: EN.admin.section.errors }).click();
  const card = page.locator('.admin-error').first();
  await card.waitFor({ timeout: 8000 }).catch(() => {});
  const cardText = await card.innerText().catch(() => '');
  check('admin: the error is listed with source, page and count', cardText.includes(EN.admin.errors.source.client) && cardText.includes('render /') && cardText.includes('×2'), cardText.replace(/\s+/g, ' ').slice(0, 120));
  await card.locator('summary').click();
  check('admin: details show the stack', (await card.locator('pre').innerText()).length > 20);
  await card.getByRole('button', { name: EN.admin.errors.resolve }).click();
  await page.getByText(EN.admin.errors.emptyOpen).waitFor({ timeout: 5000 }).catch(() => {});
  check('admin: "Mark resolved" clears it from Open', (await page.getByText(EN.admin.errors.emptyOpen).count()) === 1);
  await page.getByRole('tab', { name: EN.admin.errors.resolved }).click();
  await page.locator('.admin-error').first().waitFor({ timeout: 5000 }).catch(() => {});
  check('admin: ...and it is in Resolved', (await page.locator('.admin-error').count()) === 1);
  check('admin: no horizontal scroll', await noHScroll(page));
  await page.screenshot({ path: path.join(SP, 'day10-admin-errors-en.png') });
  await page.context().close();

  // ---- Admin errors view in Arabic ----
  page = await newPage({ lang: 'ar', theme: 'dark', width: 375 });
  await page.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: AR.admin.section.errors }).click();
  await page.getByRole('tab', { name: AR.admin.errors.resolved }).click();
  await page.locator('.admin-error').first().waitFor({ timeout: 5000 }).catch(() => {});
  check('ar: admin errors view translated, error text kept left-to-right',
    (await page.locator('.admin-error-message').first().getAttribute('dir')) === 'ltr'
    && (await page.getByText(AR.admin.errors.source.client).count()) >= 1);
  check('ar: admin view has no horizontal scroll', await noHScroll(page));
  await page.screenshot({ path: path.join(SP, 'day10-admin-errors-ar-dark-375.png') });
  await page.context().close();

  // ---- Day 75: Content-Security-Policy violations are reported ----
  // The production headers (vercel.json, served by serve-dist.cjs with the
  // local API) name the API's /csp-reports. A script added at run time with
  // no hash is blocked. Chromium sends its report later, in a batch (the
  // Reporting API) -- not seen within 90 s in headless Edge -- so the
  // delivery is checked the way Firefox and Safari send it (report-uri: a
  // POST from the page's origin), which must pass CORS and be stored.
  page = await newPage({ allow: /Content Security Policy|Refused to/ });
  const served = await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const policy = (await served.allHeaders())['content-security-policy'] || '';
  check('CSP: reports go to the API (report-uri, report-to)', policy.includes('report-uri http://localhost:3000/csp-reports') && policy.includes('report-to csp')
    && (await served.allHeaders())['reporting-endpoints'] === 'csp="http://localhost:3000/csp-reports"');
  const violation = await page.evaluate(() => new Promise((resolve) => {
    window.cspProbe = false;
    document.addEventListener('securitypolicyviolation', (e) => resolve({ ran: window.cspProbe, directive: e.effectiveDirective, blocked: e.blockedURI, report: e.disposition }), { once: true });
    const s = document.createElement('script');
    s.textContent = 'window.cspProbe = true';
    document.body.appendChild(s);
    setTimeout(() => resolve(null), 5000);
  }));
  check('CSP: an injected inline script is blocked (and a violation raised)', violation && violation.ran === false && violation.blocked === 'inline' && violation.report === 'enforce', JSON.stringify(violation));
  const posted = await page.evaluate(async (v) => (await fetch('http://localhost:3000/csp-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({ 'csp-report': { 'document-uri': location.href, 'effective-directive': v.directive, 'blocked-uri': v.blocked } })
  })).status, violation || {});
  const csp = sql("SELECT route || '|' || message FROM error_groups WHERE source = 'client' AND message LIKE 'CSP blocked%'");
  check('CSP: a report from the app reaches the error log', posted === 204 && /^csp \/\|CSP blocked inline \(script-src-elem\)$/.test(csp), `${posted} ${csp}`);
  await page.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
