// Day 72: the installed-app pieces on the PRODUCTION build (run-all.sh runs
// it on a dist stack -- the service worker only registers there). Throwaway
// stack: alice(1) follows bob(2), bob has a post. Checks: the service worker
// takes control and keeps only its two caches, with every script and style
// of the build (Day 75); the manifest and its icons
// load; and offline, a full reload still opens the app -- the banner, and
// Home's saved posts -- as does a deep link to another screen.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const EN = require('../frontend/src/i18n/locales/en.json');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((t) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1');
    localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
    localStorage.setItem('lang', 'en');
  }, aliceToken);
  const page = await ctx.newPage();
  let offline = false;
  page.on('console', (m) => { if (m.type() === 'error' && !offline) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.getByText('Hello from bob').waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' }); // now under the worker's control
  await page.getByText('Hello from bob').waitFor();
  check('the service worker controls the app', await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
  // Day 75: the worker caches every script and style of the build when it
  // installs (the list the build wrote into sw.js), not only the ones used.
  const caches = await page.evaluate(async () => {
    const names = await window.caches.keys();
    const cached = names.includes('mysocialapp-assets-v1')
      ? (await (await window.caches.open('mysocialapp-assets-v1')).keys()).map((r) => new URL(r.url).pathname) : [];
    const list = JSON.parse((await (await fetch('/sw.js')).text()).match(/const PRECACHE = (\[.*?\]);/)[1]);
    return { names: names.sort(), listed: list.length, missing: list.filter((f) => !cached.includes(f)) };
  });
  check('only its two caches', JSON.stringify(caches.names) === JSON.stringify(['mysocialapp-assets-v1', 'mysocialapp-shell-v2']), JSON.stringify(caches.names));
  check("every script and style of the build is cached, screens not yet opened included", caches.listed > 50 && caches.missing.length === 0, `${caches.listed} listed, missing: ${caches.missing.slice(0, 3).join(', ')}`);

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href;
    const m = await (await fetch(href)).json();
    const icons = await Promise.all(m.icons.map(async (i) => (await fetch(new URL(i.src, href))).status));
    return { name: m.name, display: m.display, icons };
  });
  check('the manifest and every icon load', manifest.name === 'MySocialApp' && manifest.display === 'standalone' && manifest.icons.every((s) => s === 200), JSON.stringify(manifest));

  offline = true;
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.offline-banner').waitFor({ timeout: 10000 }).catch(() => {});
  check('offline, a reload still opens the app (and says it is offline)', (await page.locator('.offline-banner').count()) === 1);
  await page.getByText(EN.feed.offlineSaved).waitFor({ timeout: 10000 }).catch(() => {});
  check("...with Home's saved posts", (await page.getByText(EN.feed.offlineSaved).count()) === 1 && (await page.getByText('Hello from bob').count()) > 0);
  await page.goto(`${WEB}/messages`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.locator('.offline-banner').waitFor({ timeout: 10000 }).catch(() => {});
  check('a link straight to another screen opens offline too', (await page.locator('.offline-banner').count()) === 1 && new URL(page.url()).pathname === '/messages');
  await ctx.setOffline(false);
  offline = false;

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
