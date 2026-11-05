// Day 26: accessibility audit with axe-core (WCAG 2.1 A + AA rules) on every
// page, light and dark, in English -- and the main pages in
// Arabic (RTL). FAILs on any "serious" or "critical" violation; "moderate"
// and "minor" ones are listed too. Throwaway stack (e2e-up.sh); seeds a
// group and a page like a3-visual.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

require('child_process').execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -c "UPDATE users SET is_admin = true WHERE id = 1"`);

const SP = __dirname;
const APP = 'http://localhost:5173';
const API = 'http://localhost:3000';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();

const AUTHED = [
  '/', '/menu', '/settings', '/settings/blocked-users', '/settings/follow-requests', '/settings/account', '/settings/sessions',
  '/settings/notifications', '/settings/language', '/saved', '/posts/1', '/hashtag/welcome', '/profile/1', '/profile/2',
  '/create-post', '/edit-profile', '/notifications', '/messages', '/messages/1', '/messages/new-group', '/search', '/explore',
  '/admin', '/admin?section=reports', '/admin?section=log', '/groups', '/groups/new', '/groups/1', '/groups/1/manage', '/pages', '/pages/new', '/pages/1', '/pages/1/edit',
  '/profile/1/connections?tab=friends', '/profile/2/connections?tab=followers',
  // Day 42: search results (tabs, people, hashtags, posts).
  '/search?q=welcome', '/search?q=bob&type=people',
  // Day 45: drafts and scheduled posts.
  '/drafts', '/drafts?tab=scheduled',
  // Day 46: a saved collection.
  '/saved/collections/1',
  // Day 47: privacy controls.
  '/settings/muted', '/settings/restricted', '/settings/close-friends', '/settings/interactions', '/settings/hidden-words', '/settings/two-factor', '/get-started', '/memories', '/events', '/events/new',
  // Day 48: the activity log.
  '/activity', '/activity?tab=comments', '/activity?tab=searches',
  // Day 112: the screens of Days 91-111 not listed yet (archived chats,
  // Admin > Search and > Verification, hashtags you follow).
  '/messages/archived', '/admin?section=search', '/admin?section=verification', '/settings/hashtags'
];
const PUBLIC = ['/welcome', '/login', '/signup', '/forgot-password', '/reset-password/sometoken', '/terms', '/privacy', '/help', '/about'];
const LANG_PAGES = ['/', '/messages/1', '/profile/2', '/settings', '/login', '/welcome', '/drafts'];
// Day 112: every screen Days 91-111 added or changed, in Arabic, in BOTH
// themes (the feature suites check Arabic in dark only).
const DAYS_91_111 = [
  '/', '/posts/1', '/hashtag/welcome', '/notifications', '/messages', '/messages/archived', '/messages/1',
  '/edit-profile', '/profile/1', '/settings/notifications', '/settings/hashtags', '/pages/1', '/pages/1/edit',
  '/admin?section=reports', '/admin?section=search', '/admin?section=verification'
];
const SERIOUS = new Set(['serious', 'critical']);
// Day 66 (AUDIT_REPORT_3 A3): A11Y_PART=light|dark|ar runs one part, so
// run-all.sh can run the audit in three short parts: English light, English
// dark, and Arabic + the keyboard checks. Unset: all of it.
const PARTS = process.env.A11Y_PART ? [process.env.A11Y_PART] : ['light', 'dark', 'ar'];
if (!PARTS.every((p) => ['light', 'dark', 'ar'].includes(p))) throw new Error(`A11Y_PART must be light, dark or ar, not ${process.env.A11Y_PART}`);

const byRule = new Map(); // rule id -> { impact, help, pages:Set, sample }
let pagesChecked = 0;

// AXE_DETAIL=1: every distinct failing contrast pair (class, colours, ratio).
const contrast = new Map();

function record(result, label) {
  for (const v of result.violations) {
    if (v.id === 'color-contrast') {
      for (const n of v.nodes) {
        const d = (n.any[0] && n.any[0].data) || {};
        const cls = (n.html.match(/class="([^"]*)"/) || [])[1] || n.target.join(' ');
        const key = `${label.split(' ')[0]} | ${cls} | ${d.fgColor} on ${d.bgColor} = ${d.contrastRatio} (needs ${d.expectedContrastRatio})`;
        if (!contrast.has(key)) contrast.set(key, label.split(' ')[1]);
      }
    }
    if (!byRule.has(v.id)) byRule.set(v.id, { impact: v.impact, help: v.help, pages: new Set(), sample: v.nodes[0]?.target?.join(' ') + ' :: ' + (v.nodes[0]?.html || '').slice(0, 140) });
    byRule.get(v.id).pages.add(label);
  }
}

(async () => {
  const auth = { Authorization: `Bearer ${aliceToken}` };
  if ((await fetch(`${API}/communities/1`, { headers: auth })).status === 404) {
    await fetch(`${API}/communities`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Yangon Hikers', description: 'Weekend trails', privacy: 'public' }) });
  }
  // Day 46: a saved collection (id 1) holding post 1.
  if ((await (await fetch(`${API}/collections`, { headers: auth })).json()).length === 0) {
    const made = await (await fetch(`${API}/collections`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Recipes' }) })).json();
    await fetch(`${API}/posts/1/collections`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionIds: [made.id] }) });
  }
  if ((await fetch(`${API}/pages/1`, { headers: auth })).status === 404) {
    await fetch(`${API}/pages`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Mingalar Tea House', category: 'business', description: 'Tea leaf salad' }) });
  }
  // Day 112: what the Day 91-111 screens show -- a followed tag, a birthday,
  // a page waiting for verification, an archived group chat. (Repeats are
  // harmless: each is idempotent or refused the second time.)
  const json = { ...auth, 'Content-Type': 'application/json' };
  await fetch(`${API}/hashtags/welcome/follow`, { method: 'PUT', headers: auth });
  await fetch(`${API}/profile/birthday`, { method: 'PUT', headers: json, body: JSON.stringify({ month: 3, day: 5, audience: 'friends' }) });
  await fetch(`${API}/pages/1/verification`, { method: 'POST', headers: json, body: JSON.stringify({ note: 'The tea house on 19th Street', link: 'https://tea.example' }) });
  const chats = await (await fetch(`${API}/conversations?archived=1`, { headers: auth })).json();
  if (!JSON.stringify(chats).includes('Tea club')) {
    const group = await (await fetch(`${API}/conversations/groups`, { method: 'POST', headers: json, body: JSON.stringify({ name: 'Tea club', userIds: [2] }) })).json();
    await fetch(`${API}/conversations/${group.id}/archive`, { method: 'PUT', headers: json, body: JSON.stringify({ archived: true }) });
  }
  // ...and it is really there (else those screens are audited empty).
  const seeded = {
    'a followed tag': (await (await fetch(`${API}/followed-hashtags`, { headers: auth })).json()).hashtags.length > 0,
    'a birthday': (await (await fetch(`${API}/profile/me`, { headers: auth })).json()).birthday_month === 3,
    'a verification request': (await (await fetch(`${API}/pages/1/verification`, { headers: auth })).json()).why_not === 'pending',
    'an archived chat': JSON.stringify(await (await fetch(`${API}/conversations?archived=1`, { headers: auth })).json()).includes('Tea club')
  };
  const missing = Object.keys(seeded).filter((k) => !seeded[k]);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function audit(routes, { authed, theme, lang }) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, th, a, l]) => {
      localStorage.setItem('theme', th);
      localStorage.setItem('lang', l);
      if (a) {
        localStorage.setItem('token', t); localStorage.setItem('userId', '1');
        localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
      }
    }, [aliceToken, theme, authed, lang]);
    const page = await ctx.newPage();
    for (const route of routes) {
      await page.goto(APP + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400); // the screen-enter animation
      await page.evaluate(AXE);
      const result = await page.evaluate(() => window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
      }));
      record(result, `${lang}/${theme} ${route}`);
      pagesChecked += 1;
    }
    await ctx.close();
  }

  for (const theme of ['light', 'dark'].filter((t) => PARTS.includes(t))) {
    await audit(AUTHED, { authed: true, theme, lang: 'en' });
    await audit(PUBLIC, { authed: false, theme, lang: 'en' });
  }
  if (PARTS.includes('ar')) {
    await audit(LANG_PAGES.filter((r) => !PUBLIC.includes(r)), { authed: true, theme: 'dark', lang: 'ar' });
    await audit(LANG_PAGES.filter((r) => PUBLIC.includes(r)), { authed: false, theme: 'light', lang: 'ar' });
    // Day 112: the Day 91-111 screens, Arabic, both themes.
    for (const theme of ['dark', 'light']) await audit(DAYS_91_111, { authed: true, theme, lang: 'ar' });
  }
  // Keyboard: Tab through a few screens; every stop must show a focus ring
  // (an outline or a box-shadow), and focus must never fall back to <body>.
  // (Part "ar", the shortest.)
  const keyboard = [];
  const KEYBOARD_PAGES = [['/welcome', false], ['/login', false], ['/', true], ['/settings', true], ['/messages/1', true]];
  for (const [route, authed] of PARTS.includes('ar') ? KEYBOARD_PAGES : []) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, a]) => {
      localStorage.setItem('lang', 'en');
      if (a) {
        localStorage.setItem('token', t); localStorage.setItem('userId', '1');
        localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
      }
    }, [aliceToken, authed]);
    const page = await ctx.newPage();
    await page.goto(APP + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const bad = [];
    let stops = 0;
    for (let i = 0; i < 15; i += 1) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
        return { ring, what: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}"` };
      });
      if (!f) { if (stops === 0) bad.push('nothing focusable'); break; }
      stops += 1;
      if (!f.ring) bad.push(f.what);
    }
    keyboard.push([route, stops, [...new Set(bad)]]);
    await ctx.close();
  }
  await browser.close();

  for (const [route, stops, bad] of keyboard) {
    console.log(`${bad.length ? 'FAIL' : 'PASS'}  keyboard ${route}: ${stops} Tab stops${bad.length ? ', no visible focus on: ' + bad.join('; ') : ', all with a visible focus ring'}`);
  }
  const keyboardFailed = keyboard.some(([, , bad]) => bad.length);
  console.log(`${missing.length ? 'FAIL' : 'PASS'}  the Day 91-111 screens have their content${missing.length ? ' -- missing: ' + missing.join(', ') : ''}`);

  const rules = [...byRule.entries()].sort((a, b) => (SERIOUS.has(b[1].impact) - SERIOUS.has(a[1].impact)) || b[1].pages.size - a[1].pages.size);
  for (const [id, r] of rules) {
    const status = SERIOUS.has(r.impact) ? 'FAIL' : 'NOTE';
    const pages = [...r.pages];
    console.log(`${status}  ${id} (${r.impact}) on ${pages.length} page(s): ${r.help}`);
    console.log(`      e.g. ${pages.slice(0, 4).join(', ')}${pages.length > 4 ? ', ...' : ''}`);
    console.log(`      ${r.sample}`);
  }
  if (process.env.AXE_DETAIL) for (const [k, route] of contrast) console.log(`  contrast: ${k}  [${route}]`);
  if (!rules.some(([, r]) => SERIOUS.has(r.impact))) console.log('PASS  no serious or critical accessibility violations');
  console.log(`\n${pagesChecked} page checks`);
  process.exit(keyboardFailed || missing.length || rules.some(([, r]) => SERIOUS.has(r.impact)) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
