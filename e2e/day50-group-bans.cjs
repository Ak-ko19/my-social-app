// Day 50: group moderation -- Remove and ban (headless Edge, throwaway
// stack: alice(1), bob(2)). Alice runs a public group. Bob, not in it,
// reads its posts and comments but can't react or comment. He joins;
// alice removes him with "Also ban them"; he's listed under Banned and
// Join tells him he can't. Alice unbans him and he can join again. Arabic
// (RTL) + dark at 375px with axe on the Manage screen and its dialog.
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
// The refused join itself (a 403 in the console) is expected here.
const EXPECTED = /status of 403|status code 403|AxiosError/;
// ...and, once the group is deleted, the 404s for it.
let groupDeleted = false;
const GONE = /status of 404/;

(async () => {
  const group = await (await api('alice', 'POST', '/communities', { name: 'Trail Runners', privacy: 'public' })).json();
  const form = new FormData();
  form.append('content', 'Saturday: 10 km along the river');
  form.append('communityId', String(group.id));
  const post = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}` }, body: form })).json();
  await api('alice', 'POST', `/posts/${post.id}/comments`, { content: 'Meet at the bridge' });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED.test(m.text()) && !(groupDeleted && GONE.test(m.text()))) errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const axe = async (page, label, selector = '.screen-enter') => {
    await page.waitForTimeout(400);
    await page.evaluate(AXE);
    const r = await page.evaluate((sel) => window.axe.run(document.querySelector(sel) || document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }), selector);
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };
  const card = (page) => page.locator('article.post-card', { hasText: 'Saturday: 10 km' });

  // 1. Not in the group: read, don't take part.
  let bob = await open('bob', `/groups/${group.id}`);
  await card(bob).waitFor({ timeout: 10000 }).catch(() => {});
  check('a non-member reads the public group\'s post', (await card(bob).count()) === 1);
  check('...without a reaction button', (await card(bob).locator('.post-card-actions button').allInnerTexts()).every((x) => !/Like/.test(x)));
  await card(bob).getByRole('button', { name: 'Comment', exact: true }).click();
  await bob.getByText('Meet at the bridge').waitFor({ timeout: 8000 }).catch(() => {});
  check('...reads the comments, with "Join the group to comment and react." instead of the form',
    (await bob.getByText('Join the group to comment and react.').count()) === 1 && (await card(bob).locator('input[id^="comment-input-"]').count()) === 0);
  await axe(bob, 'en/light, group as a non-member');

  // 2. He joins; alice removes and bans him.
  await bob.getByRole('button', { name: 'Join group' }).click();
  await bob.getByRole('button', { name: 'Leave' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Join: he is a member now', sql(`SELECT status FROM community_members WHERE community_id = ${group.id} AND user_id = 2`) === 'member');
  await bob.context().close();

  const alice = await open('alice', `/groups/${group.id}/manage`);
  await alice.getByRole('button', { name: 'Remove bob' }).click();
  const dialog = alice.getByRole('dialog');
  check('Remove asks first', (await dialog.getByText('Remove bob from the group?').count()) === 1);
  await dialog.getByRole('checkbox', { name: /Also ban them/ }).check();
  await dialog.getByRole('button', { name: 'Remove and ban' }).click();
  await alice.getByRole('button', { name: 'Unban bob' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Remove and ban: out of the group, listed under Banned', (await alice.getByRole('button', { name: 'Unban bob' }).count()) === 1
    && (await alice.getByRole('button', { name: 'Remove bob' }).count()) === 0
    && sql(`SELECT COUNT(*) FROM community_bans WHERE community_id = ${group.id} AND user_id = 2`) === '1');
  await axe(alice, 'en/light, Manage group with a ban');

  // 3. Banned: Join says why.
  bob = await open('bob', `/groups/${group.id}`);
  await bob.getByRole('button', { name: 'Join group' }).click();
  const why = bob.getByRole('alert');
  await why.waitFor({ timeout: 8000 }).catch(() => {});
  check('banned: Join says "You can\'t join this group"', (await why.innerText().catch(() => '')) === "You can't join this group"
    && sql(`SELECT COUNT(*) FROM community_members WHERE community_id = ${group.id} AND user_id = 2`) === '0');

  // 4. Unbanned: he can join again.
  await alice.getByRole('button', { name: 'Unban bob' }).click();
  await alice.getByText('Nobody is banned from this group.').waitFor({ timeout: 8000 }).catch(() => {});
  check('Unban empties the list', (await alice.getByText('Nobody is banned from this group.').count()) === 1);
  await alice.context().close();
  await bob.reload({ waitUntil: 'networkidle' });
  await bob.getByRole('button', { name: 'Join group' }).click();
  await bob.getByRole('button', { name: 'Leave' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('...and he can join again', (await bob.getByRole('button', { name: 'Leave' }).count()) === 1);
  await bob.context().close();

  // 4b. Paged members (step 3): 24 more people join; Manage shows 20 of
  // the 26, then the rest on Load more.
  for (let i = 0; i < 24; i += 1) {
    const email = `crowd${i}@example.com`;
    await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `crowd${i}`, email, password: 'a-fine-password-123' }) });
    const { token } = await (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'a-fine-password-123' }) })).json();
    await fetch(`${API}/communities/${group.id}/join`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  }
  const paged = await open('alice', `/groups/${group.id}/manage`);
  await paged.getByRole('heading', { name: 'Members (26)' }).waitFor({ timeout: 8000 }).catch(() => {});
  const memberRows = () => paged.locator('.card-list').nth(0).locator('li');
  check('Manage group: "Members (26)", the first 20 shown', (await paged.getByRole('heading', { name: 'Members (26)' }).count()) === 1
    && (await paged.getByRole('button', { name: /^Remove (crowd|bob)/ }).count()) === 19);
  await paged.getByRole('button', { name: 'Load more' }).click();
  await paged.getByRole('button', { name: 'Remove crowd23' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('...Load more shows the other 6', (await paged.getByRole('button', { name: /^Remove (crowd|bob)/ }).count()) === 25
    && (await paged.getByRole('button', { name: 'Load more' }).count()) === 0, String(await memberRows().count()));
  await paged.context().close();

  // 5. Arabic, dark, 375px.
  const ar = await open('alice', `/groups/${group.id}/manage`, { lang: 'ar', theme: 'dark', width: 375 });
  const removeName = AR.groups.removeName.replace('{{name}}', 'bob');
  await ar.getByRole('button', { name: removeName }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: Manage group in Arabic, right to left, no sideways scroll', (await ar.getByRole('heading', { name: AR.groups.banned }).count()) === 1
    && (await ar.evaluate(() => document.documentElement.dir)) === 'rtl'
    && (await ar.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await axe(ar, 'ar/dark, Manage group');
  await ar.getByRole('button', { name: removeName }).click();
  await ar.getByRole('dialog').getByRole('checkbox', { name: AR.groups.alsoBan }).check();
  check('ar: the dialog in Arabic', (await ar.getByRole('dialog').getByRole('button', { name: AR.groups.removeAndBan }).count()) === 1);
  await axe(ar, 'ar/dark, Remove and ban dialog', '[role=dialog]');
  await ar.screenshot({ path: path.join(SP, 'day50-ban-ar-dark-375.png') });
  await ar.context().close();

  // 6. Delete the group (step 2): the name typed to confirm.
  const owner = await open('alice', `/groups/${group.id}/manage`);
  await owner.getByRole('button', { name: 'Delete group' }).click();
  const del = owner.getByRole('dialog');
  const confirmBtn = del.getByRole('button', { name: 'Delete group' });
  check('Delete group asks for the name first', await confirmBtn.isDisabled());
  await del.getByRole('textbox').fill('Trail Runners');
  await axe(owner, 'en/light, Delete group dialog', '[role=dialog]');
  await confirmBtn.click();
  await owner.waitForURL(`${WEB}/groups`, { timeout: 8000 }).catch(() => {});
  check('...then it is gone, with its posts, and you are on Groups', owner.url() === `${WEB}/groups`
    && sql(`SELECT COUNT(*) FROM communities WHERE id = ${group.id}`) === '0' && sql(`SELECT COUNT(*) FROM posts WHERE id = ${post.id}`) === '0');
  await owner.context().close();
  groupDeleted = true;
  const member = await open('bob', `/groups/${group.id}`);
  await member.getByText('This group no longer exists.').waitFor({ timeout: 8000 }).catch(() => {});
  check('a member opening it later is told it is gone, with no Try again', (await member.getByText('This group no longer exists.').count()) === 1
    && (await member.getByRole('button', { name: 'Try again' }).count()) === 0);
  await member.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
