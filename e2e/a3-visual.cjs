// A3 visual verification in headless Edge against the throwaway stack:
// every route x widths 375/390/430 x light/dark.
//  - FAIL if the page scrolls horizontally, or any visible element pokes
//    past the right edge of the viewport (clipping).
//  - FAIL on console errors / page errors.
//  - Dark mode: FAIL if the page background or any large surface is still
//    a light color (luminance > 0.6) while data-theme=dark -- i.e. an
//    un-migrated hardcoded light surface.
//  - Saves 390px screenshots of both themes for eyeballing.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
// B12: make alice an admin in the throwaway DB so /admin renders the real
// moderation screen (not the non-admin "Not found").
require('child_process').execSync(require('./pg.cjs').PSQL + ' -h localhost -p 55433 -U testuser -d mysocialapp_e2e -c "UPDATE users SET is_admin = true WHERE id = 1"');

const SP = __dirname;
const APP = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
// B16: A3_LANG=ar runs the whole matrix in Arabic (RTL).
const LANG = process.env.A3_LANG || 'en';
const OUT = path.join(SP, LANG === 'en' ? 'a3-shots' : `a3-shots-${LANG}`);
fs.mkdirSync(OUT, { recursive: true });

const AUTHED = [
  '/', '/menu', '/settings', '/settings/blocked-users', '/settings/follow-requests',
  '/settings/account', '/saved', '/posts/1', '/hashtag/welcome', '/profile/2',
  '/create-post', '/edit-profile', '/notifications', '/messages', '/messages/1', '/search', '/explore', '/profile/1', '/messages/new-group', '/settings/notifications', '/admin',
  '/groups', '/groups/new', '/groups/1', '/groups/1/manage',
  '/pages', '/pages/new', '/pages/1', '/pages/1/edit', '/settings/language',
  '/settings/sessions', '/drafts', '/saved/collections/1', '/settings/muted', '/settings/restricted', '/settings/close-friends', '/settings/interactions', '/settings/hidden-words', '/settings/two-factor', '/get-started', '/activity', '/events', '/events/new'
];
const PUBLIC = ['/login', '/signup', '/forgot-password', '/reset-password/sometoken', '/terms', '/privacy', '/welcome'];
const WIDTHS = [375, 390, 430];
// Day 66 (AUDIT_REPORT_3 A3): A3_THEME=light|dark runs one theme only, so
// run-all.sh can run the matrix in four short parts (language x theme).
const THEMES = process.env.A3_THEME ? [process.env.A3_THEME] : ['light', 'dark'];
if (!THEMES.every((t) => ['light', 'dark'].includes(t))) throw new Error(`A3_THEME must be light or dark, not ${process.env.A3_THEME}`);

const failures = [];
let checks = 0;

(async () => {
  // B13: a group (id 1) with one post so /groups/1 and its manage screen render real content.
  const auth = { Authorization: `Bearer ${aliceToken}` };
  if ((await fetch('http://localhost:3000/communities/1', { headers: auth })).status === 404) {
    await fetch('http://localhost:3000/communities', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Yangon Hikers', description: 'Weekend trails', privacy: 'public' }) });
    const f = new FormData(); f.append('content', 'First group hike'); f.append('communityId', '1');
    await fetch('http://localhost:3000/posts', { method: 'POST', headers: auth, body: f });
  }
  // Day 46: a saved collection (id 1) holding post 1.
  if ((await (await fetch(`http://localhost:3000/collections`, { headers: auth })).json()).length === 0) {
    const made = await (await fetch(`http://localhost:3000/collections`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Recipes' }) })).json();
    await fetch(`http://localhost:3000/posts/1/collections`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionIds: [made.id] }) });
  }
  // B14: a page (id 1) owned by alice, with one post.
  if ((await fetch('http://localhost:3000/pages/1', { headers: auth })).status === 404) {
    await fetch('http://localhost:3000/pages', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Mingalar Tea House', category: 'business', description: 'Tea leaf salad' }) });
    const pf = new FormData(); pf.append('content', 'Grand opening'); pf.append('pageId', '1');
    await fetch('http://localhost:3000/posts', { method: 'POST', headers: auth, body: pf });
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const [routes, authed] of [[AUTHED, true], [PUBLIC, false]]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        await context.addInitScript(([t, th, authed, lang]) => {
          localStorage.setItem('theme', th);
          localStorage.setItem('lang', lang);
          if (authed) {
            localStorage.setItem('token', t);
            localStorage.setItem('userId', '1');
            localStorage.setItem('username', 'alice');
            localStorage.setItem('emailVerified', 'true');
          }
        }, [aliceToken, theme, authed, LANG]);
        const page = await context.newPage();
        const errors = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(e.message));

        for (const route of routes) {
          errors.length = 0;
          await page.goto(APP + route, { waitUntil: 'networkidle' });
          await page.waitForTimeout(400); // let screen-enter animation finish
          if (route === '/search') {
            await page.getByRole('searchbox').fill('bob');
            // exact: once "bob" is a recent search, its remove button's label
            // contains the word "search" too (substring match otherwise).
            await page.getByRole('button', { name: { ar: 'بحث' }[LANG] || /^search$/i, exact: true }).click();
            await page.waitForTimeout(800);
          }
          const tag = `${LANG} ${theme} ${width}px ${route}`;
          checks++;

          const res = await page.evaluate(() => {
            const vw = document.documentElement.clientWidth;
            const hScroll = document.documentElement.scrollWidth > vw + 1;
            const overflowing = [];
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) continue;
              const cs = getComputedStyle(el);
              if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
              // Skip things intentionally clipped by an overflow:hidden/auto ancestor.
              let clipped = false;
              for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                const pcs = getComputedStyle(p);
                if (pcs.overflowX !== 'visible' || pcs.overflow !== 'visible') {
                  const pr = p.getBoundingClientRect();
                  if (pr.right <= vw + 1 && pr.left >= -1) { clipped = true; break; }
                }
              }
              if (!clipped && r.right > vw + 1) {
                overflowing.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(r.right)}`);
              }
              // B16: in RTL, overflow goes off the LEFT edge.
              if (!clipped && r.left < -1) {
                overflowing.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} left=${Math.round(r.left)}`);
              }
            }
            // Light-surface detection for dark mode.
            const lum = (c) => {
              const m = c.match(/rgba?\(([^)]+)\)/);
              if (!m) return null;
              const [r, g, b, a = 1] = m[1].split(',').map(Number);
              if (a < 0.5) return null;
              const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
              return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
            };
            const lightSurfaces = [];
            if (document.documentElement.getAttribute('data-theme') === 'dark') {
              for (const el of document.querySelectorAll('body, body *')) {
                const r = el.getBoundingClientRect();
                if (r.width * r.height < 2000) continue; // ignore small chips/badges/dots
                const l = lum(getComputedStyle(el).backgroundColor);
                if (l !== null && l > 0.6) lightSurfaces.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.width)}x${Math.round(r.height)}`);
              }
            }
            const vClipped = [];
            for (const el of document.querySelectorAll('body *')) {
              const cs = getComputedStyle(el);
              if (cs.overflowY !== 'hidden' && cs.overflow !== 'hidden') continue;
              if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') continue;
              const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
              if (!hasText || el.clientHeight <= 1 || el.clientWidth <= 1) continue; // 1px = screen-reader-only text
              if (el.scrollHeight > el.clientHeight + 2) vClipped.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${el.clientHeight}<${el.scrollHeight}`);
            }
            const bar = document.querySelector('.bottom-tab-bar');
            const barFloating = bar && document.documentElement.scrollHeight <= window.innerHeight + 1
              && bar.getBoundingClientRect().bottom < window.innerHeight - 1;
            return {
              barFloating,
              hScroll, overflowing: overflowing.slice(0, 5), lightSurfaces: lightSurfaces.slice(0, 5), vClipped: vClipped.slice(0, 5), lang: document.documentElement.lang, dir: document.documentElement.dir,
              theme: document.documentElement.getAttribute('data-theme')
            };
          });

          if (res.theme !== theme) failures.push(`${tag}: data-theme is ${res.theme}`);
          if (res.barFloating) failures.push(`${tag}: tab bar floats above the bottom edge`);
          if (res.hScroll) failures.push(`${tag}: horizontal scroll`);
          if (res.lang !== LANG) failures.push(`${tag}: html lang is ${res.lang}`);
          if (res.dir !== (LANG === 'ar' ? 'rtl' : 'ltr')) failures.push(`${tag}: html dir is ${res.dir}`);
          if (res.vClipped.length) failures.push(`${tag}: text clipped vertically -> ${res.vClipped.join(' | ')}`);
          if (res.overflowing.length) failures.push(`${tag}: overflow -> ${res.overflowing.join(' | ')}`);
          if (res.lightSurfaces.length) failures.push(`${tag}: light surface in dark mode -> ${res.lightSurfaces.join(' | ')}`);
          if (errors.length) failures.push(`${tag}: console -> ${errors.slice(0, 2).join(' | ')}`);

          if (width === 390) {
            const name = `${theme}${route.replace(/[/:]/g, '_') || '_root'}.png`;
            await page.screenshot({ path: path.join(OUT, name), fullPage: false });
          }
        }
        await context.close();
      }
    }
  }
  await browser.close();
  console.log(`${checks} page checks, ${failures.length} failures`);
  failures.forEach((f) => console.log('FAIL ' + f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
