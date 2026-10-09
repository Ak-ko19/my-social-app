// Day 48: the activity log (headless Edge, throwaway stack: alice(1),
// bob(2)). Alice reacts to bob's post, likes his comment, comments, and
// searches; Settings > Your activity lists each with what it was on, and
// removes them: the reaction, the comment (asks first), the searches
// (clear all asks). Arabic (RTL) + dark at 375px with axe. Bob never sees
// alice's activity.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const AR = JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'ar.json'), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
const api = (who, method, url, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${tokens[who]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined
});

(async () => {
  // Bob's post and comment; alice's activity on them.
  const form = new FormData();
  form.append('content', 'Sunset over the bay');
  const bobPost = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.bob}` }, body: form })).json();
  const bobComment = await (await api('bob', 'POST', `/posts/${bobPost.id}/comments`, { content: 'Taken from the pier' })).json();
  await api('alice', 'PUT', `/posts/${bobPost.id}/reaction`, { reaction: 'love' });
  await api('alice', 'POST', `/comments/${bobComment.id}/like`);
  await api('alice', 'POST', `/posts/${bobPost.id}/comments`, { content: 'Beautiful colours' });
  await api('alice', 'POST', '/search/history', { query: 'sunset' });
  await api('alice', 'POST', '/search/history', { query: 'pier' });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const axe = async (page, label) => {
    await page.waitForTimeout(400); // the screen-enter animation
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document.querySelector('.screen-enter'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }));
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };
  const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // 1. From Settings to the Likes tab.
  const alice = await open('alice', '/settings');
  await alice.getByRole('button', { name: /Your activity/ }).click();
  await alice.waitForURL(`${WEB}/activity`, { timeout: 8000 }).catch(() => {});
  const reacted = alice.getByRole('link', { name: "You reacted Love to bob's post" });
  await reacted.waitFor({ timeout: 8000 }).catch(() => {});
  check('Settings > Your activity: the Love reaction, linking to the post', (await reacted.getAttribute('href')) === `/posts/${bobPost.id}`);
  check("...and the liked comment, quoted", (await alice.getByRole('link', { name: "You liked bob's comment" }).count()) === 1
    && (await alice.getByText('“Taken from the pier”').count()) === 1);
  await axe(alice, 'en/light, Likes');
  await alice.getByRole('button', { name: "Remove your reaction to bob's post" }).click();
  await reacted.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  check('Remove reaction: gone from the list and from the post', sql(`SELECT COUNT(*) FROM likes WHERE post_id = ${bobPost.id} AND user_id = 1`) === '0');

  // 2. Comments: delete asks first.
  await alice.getByRole('tab', { name: /Comments/ }).click();
  await alice.getByRole('link', { name: "You commented on bob's post" }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Comments tab: hers, with her text', (await alice.getByText('Beautiful colours').count()) === 1);
  await alice.getByRole('button', { name: "Delete your comment on bob's post" }).click();
  await alice.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await alice.getByText(/Your comments show up here/).waitFor({ timeout: 8000 }).catch(() => {});
  check('...deleted after asking', sql("SELECT COUNT(*) FROM comments WHERE user_id = 1") === '0');

  // 3. Searches: clear all asks.
  await alice.getByRole('tab', { name: /Searches/ }).click();
  await alice.getByRole('link', { name: 'pier' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Searches tab: newest first', (await alice.locator('.activity-title').allInnerTexts()).join('|') === 'pier|sunset');
  await alice.getByRole('button', { name: 'Clear all searches' }).click();
  await alice.getByRole('dialog').getByRole('button', { name: 'Clear' }).click();
  await alice.getByText('No recent searches.').waitFor({ timeout: 8000 }).catch(() => {});
  check('...cleared after asking', sql('SELECT COUNT(*) FROM search_history WHERE user_id = 1') === '0');
  await alice.context().close();

  // 4. Arabic, dark, 375px.
  await api('alice', 'POST', `/posts/${bobPost.id}/like`);
  const ar = await open('alice', '/activity', { lang: 'ar', theme: 'dark', width: 375 });
  const arText = AR.activity.reacted.replace('{{reaction}}', AR.reactions.like).replace('{{name}}', 'bob');
  await ar.getByRole('link', { name: arText }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: the reaction in Arabic, right to left', (await ar.getByRole('link', { name: arText }).count()) === 1
    && (await ar.evaluate(() => document.documentElement.dir)) === 'rtl');
  check('ar: no sideways scroll at 375px', await noSideScroll(ar));
  await axe(ar, 'ar/dark, Likes');
  await ar.screenshot({ path: path.join(SP, 'day48-activity-ar-dark-375.png') });
  await ar.context().close();

  // 5. Private.
  const bobSees = await (await api('bob', 'GET', '/activity/likes')).json();
  check("bob's activity log has none of alice's", Array.isArray(bobSees.items) && bobSees.items.length === 0);

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
