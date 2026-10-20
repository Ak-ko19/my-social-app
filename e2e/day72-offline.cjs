// Day 72: offline (headless Edge, throwaway stack: alice(1) follows bob(2);
// bob has a post). Alice opens Home online, then the device goes offline:
// a banner says so on every screen, and Home -- reached again inside the
// app -- shows the posts it saved, marked as such, in English and Arabic
// (right to left). Back online, Home loads by itself. In a chat, a message
// written offline waits ("Waiting for connection"; "Don't send" takes it
// back) and goes by itself once online. Logging out leaves nothing saved.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const AR = require('../frontend/src/i18n/locales/ar.json');
const EN = require('../frontend/src/i18n/locales/en.json');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // English last: its logout ends alice's session (the token both share).
  for (const [lang, L, theme] of [['ar', AR, 'dark'], ['en', EN, 'light']]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await ctx.addInitScript(([t, l, th]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('token', t); localStorage.setItem('userId', '1');
        localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
        localStorage.setItem('lang', l); localStorage.setItem('theme', th);
        sessionStorage.setItem('seeded', '1');
      }
    }, [aliceToken, lang, theme]);
    const page = await ctx.newPage();
    let offline = false;
    // While offline every request fails on purpose: those failures are expected.
    page.on('console', (m) => { if (m.type() === 'error' && !offline) errors.push(`${lang}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    await page.getByText('Hello from bob').waitFor();
    check(`${lang}: online, no banner`, (await page.locator('.offline-banner').count()) === 0);

    offline = true;
    await ctx.setOffline(true);
    await page.locator('.offline-banner').waitFor({ timeout: 5000 });
    check(`${lang}: offline, the banner says so`, (await page.locator('.offline-banner').innerText()).includes(L.offline.banner));
    await page.getByRole('button', { name: L.nav.messages, exact: true }).click();
    check(`${lang}: ...on other screens too`, (await page.locator('.offline-banner').count()) === 1);
    await page.getByRole('button', { name: L.nav.home, exact: true }).click();
    await page.getByText(L.feed.offlineSaved).waitFor({ timeout: 8000 });
    check(`${lang}: Home shows the saved posts, marked as saved`, (await page.getByText('Hello from bob').count()) > 0);
    const dir = await page.evaluate(() => document.documentElement.dir);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${lang}: ${lang === 'ar' ? 'right to left' : 'left to right'}, no sideways scroll`, dir === (lang === 'ar' ? 'rtl' : 'ltr') && !sideways);
    await page.screenshot({ path: path.join(SP, `day72-offline-${lang}-${theme}-375.png`) });

    // The first requests after the connection returns may still fail (expected).
    await ctx.setOffline(false);
    await page.getByText(L.feed.offlineSaved).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    const state = { note: await page.getByText(L.feed.offlineSaved).count(), banner: await page.locator('.offline-banner').count(), post: await page.getByText('Hello from bob').count() };
    offline = false;
    check(`${lang}: back online, Home loads by itself and the banner goes`, state.note === 0 && state.banner === 0 && state.post > 0, JSON.stringify(state));

    if (lang === 'en') {
      // A message written offline waits, then goes by itself.
      const history = async () => (await (await fetch(`http://localhost:3000/conversations/1/messages`, { headers: { Authorization: `Bearer ${aliceToken}` } })).json()).messages.map((m) => m.content);
      await page.goto(`${WEB}/messages/1`, { waitUntil: 'networkidle' });
      await page.getByRole('textbox', { name: 'Write a message' }).waitFor();
      offline = true;
      await ctx.setOffline(true);
      await page.locator('.offline-banner').waitFor({ timeout: 5000 });
      await page.getByRole('textbox', { name: 'Write a message' }).fill('written on the train');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByRole('img', { name: L.messages.status.queued }).waitFor({ timeout: 5000 });
      check('chat offline: the message waits ("Waiting for connection")', !(await history()).includes('written on the train'));
      await page.getByRole('textbox', { name: 'Write a message' }).fill('changed my mind');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByRole('button', { name: L.messages.cancelQueued }).last().click();
      check("...and Don't send takes one back", (await page.getByText('changed my mind').count()) === 0);
      await ctx.setOffline(false);
      await page.getByRole('img', { name: L.messages.status.queued }).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
      offline = false;
      const sent = await history();
      check('back online: it was sent, once; the other never was',
        sent.filter((c) => c === 'written on the train').length === 1 && !sent.includes('changed my mind'), JSON.stringify(sent.slice(-3)));
      check('nothing is left waiting on the device', await page.evaluate(() => Object.keys(localStorage).every((k) => !k.startsWith('offline:outbox:'))));

      check('a saved copy is on the device while logged in', await page.evaluate(() => Boolean(localStorage.getItem('offline:feed:1'))));
      await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Log Out' }).click();
      await page.waitForURL((url) => !/\/settings/.test(url.pathname), { timeout: 10000 });
      check('logging out removes it', await page.evaluate(() => Object.keys(localStorage).every((k) => !k.startsWith('offline:'))));
    }
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
