// Day 37: friends = people who follow each other (headless Edge,
// throwaway stack: alice(1), bob(2); carol is signed up here).
// Bob follows alice -> alice's button on bob's profile says "Follow back";
// following back makes them friends. Carol is friends with both, so alice
// sees "1 mutual friend: carol" on bob's profile. The counts open the
// friends / followers / following lists (tabs, keyboard, Follow buttons);
// logged-out visitors can open a public account's lists, not a private
// one's. "1 follower" is singular. Dark and Arabic (RTL).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  const users = {
    alice: { id: 1, token: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim() },
    bob: { id: 2, token: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() }
  };
  const creds = { username: 'carol', email: 'carol@example.com', password: 'a-fine-password-123' };
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
  const login = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: creds.email, password: creds.password }) }).then((r) => r.json());
  users.carol = { id: login.id, token: login.token };
  const follow = (a, b) => fetch(`${API}/users/${users[b].id}/follow`, { method: 'POST', headers: { Authorization: `Bearer ${users[a].token}` } });
  // The stack seeds bob -> alice? Start from a clean slate for these three.
  for (const [a, b] of [['alice', 'bob'], ['bob', 'alice']]) {
    await fetch(`${API}/users/${users[b].id}/follow`, { method: 'DELETE', headers: { Authorization: `Bearer ${users[a].token}` } });
  }
  await follow('bob', 'alice');
  for (const [a, b] of [['carol', 'alice'], ['alice', 'carol'], ['carol', 'bob'], ['bob', 'carol']]) await follow(a, b);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      if (t) {
        localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
        localStorage.setItem('emailVerified', 'true');
      }
      localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [who ? users[who].token : null, who ? users[who].id : 0, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/403|Forbidden/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };

  // 1. Follow back -> friends; mutual friends.
  const alice = await open('alice', '/profile/2');
  await alice.locator('.profile-mutual').waitFor({ timeout: 10000 }).catch(() => {});
  check('bob follows alice: her button on his profile says "Follow back"', (await alice.getByRole('button', { name: 'Follow back' }).count()) === 1);
  check('she sees "1 mutual friend: carol"', (await alice.locator('.profile-mutual').innerText().catch(() => '')) === '1 mutual friend: carol');
  await alice.getByRole('button', { name: 'Follow back' }).click();
  await alice.getByRole('button', { name: 'Following' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('following back -> "Following"', (await alice.getByRole('button', { name: 'Following' }).count()) === 1);

  // 2. Alice's own profile: counts are links; friends list.
  await alice.goto(`${WEB}/profile/1`, { waitUntil: 'networkidle' });
  const friendsLink = alice.getByRole('link', { name: /2 friends/ });
  await friendsLink.waitFor({ timeout: 10000 }).catch(() => {});
  check('her profile shows "2 friends" (bob and carol) as a link', (await friendsLink.count()) === 1);
  await friendsLink.click();
  await alice.waitForURL(/\/profile\/1\/connections\?tab=friends/, { timeout: 8000 }).catch(() => {});
  const rows = alice.locator('.connections-row');
  await rows.first().waitFor({ timeout: 8000 }).catch(() => {});
  check('the friends tab lists bob and carol, A-Z', (await rows.locator('.connections-name').allTextContents()).join(',') === 'bob,carol');
  check('...each with a Following button', (await alice.getByRole('button', { name: 'Following bob' }).count()) === 1 && (await alice.getByRole('button', { name: 'Following carol' }).count()) === 1);

  // Keyboard: arrow to Followers.
  await alice.getByRole('tab', { name: 'Friends' }).focus();
  await alice.keyboard.press('ArrowRight');
  await alice.getByRole('tab', { name: 'Followers', selected: true }).waitFor({ timeout: 5000 }).catch(() => {});
  check('ArrowRight moves to the Followers tab (and the URL follows)', (await alice.getByRole('tab', { name: 'Followers', selected: true }).count()) === 1 && alice.url().includes('tab=followers'));

  // 3. Bob unfollows carol from his Following list -> no longer friends.
  const bob = await open('bob', '/profile/2/connections?tab=following');
  await bob.getByRole('button', { name: 'Following carol' }).click();
  await bob.getByRole('button', { name: 'Follow back carol' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('unfollowing from the list -> "Follow back" (she still follows him)', (await bob.getByRole('button', { name: 'Follow back carol' }).count()) === 1);
  const counts = await fetch(`${API}/users/2/follow-counts`).then((r) => r.json());
  check('bob now has 1 friend (alice)', counts.friendsCount === 1, JSON.stringify(counts));

  // 4. Singular count; logged-out visitor; private account.
  const anon = await open(null, '/profile/2');
  await anon.locator('.profile-screen-counts').waitFor({ timeout: 10000 });
  const countText = await anon.locator('.profile-screen-counts').innerText();
  check('"1 friend" and "2 followers" read correctly', /\b1 friend\b/.test(countText) && /\b2 followers\b/.test(countText), countText.replace(/\s+/g, ' '));
  await anon.getByRole('link', { name: /followers/ }).click();
  await anon.locator('.connections-row').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('a logged-out visitor can open a public account\'s followers (no buttons)', (await anon.locator('.connections-row').count()) === 2 && (await anon.getByRole('button', { name: /^Follow/ }).count()) === 0);
  await fetch(`${API}/profile/privacy`, { method: 'PUT', headers: { Authorization: `Bearer ${users.carol.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ isPrivate: true }) });
  await anon.goto(`${WEB}/profile/${users.carol.id}/connections?tab=friends`, { waitUntil: 'networkidle' });
  await anon.locator('.connections-status').waitFor({ timeout: 8000 }).catch(() => {});
  check('a private account\'s lists are explained, not shown', (await anon.locator('.connections-status').innerText()).includes('only visible to their followers'));

  // 5. Dark and Arabic.
  for (const [theme, lang, friendsTab] of [['dark', 'en', 'Friends'], ['light', 'ar', 'الأصدقاء']]) {
    const p = await open('alice', '/profile/1/connections?tab=friends', { theme, lang });
    await p.locator('.connections-row').first().waitFor({ timeout: 8000 }).catch(() => {});
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}/${lang}: tabs and rows fit, no sideways scroll`, (await p.getByRole('tab', { name: friendsTab }).count()) === 1 && (await p.locator('.connections-row').count()) >= 1 && !overflow);
    if (lang === 'ar') check('Arabic page is right-to-left', (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
    await p.screenshot({ path: path.join(SP, `day37-friends-${theme}-${lang}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
