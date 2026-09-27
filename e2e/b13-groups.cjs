// B13 Groups in headless Edge (throwaway stack from e2e-up.sh).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const results = [];
const errors = [];
let expectedErrors = null;
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const call = (method, url, token) => fetch(API + url, { method, headers: { Authorization: `Bearer ${token}` } });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async (token, id, name, { width = 390, theme = 'light' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, i, n, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', i);
      localStorage.setItem('username', n); localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th);
    }, [token, String(id), name, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (expectedErrors && expectedErrors.test(m.text())) return;
      errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };

  // Menu -> Groups -> Create (private).
  const alice = await newPage(aliceToken, 1, 'alice');
  await alice.goto(`${WEB}/menu`, { waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: /Groups/ }).click();
  await alice.waitForURL(`${WEB}/groups`);
  await alice.getByText("You haven't joined any groups yet.").waitFor();
  check('Menu Groups row opens /groups (empty state)', true);
  await alice.getByRole('button', { name: /Create/ }).click();
  await alice.waitForURL(`${WEB}/groups/new`);
  await alice.getByLabel('Name').fill('Yangon Hikers');
  await alice.getByLabel('Description (optional)').fill('Weekend trails around Yangon');
  await alice.getByText('Private', { exact: true }).click();
  await alice.getByText(/only members see posts/).waitFor();
  await alice.getByRole('button', { name: 'Create group' }).click();
  await alice.waitForURL(/\/groups\/\d+$/);
  const gid = alice.url().match(/groups\/(\d+)/)[1];
  await alice.getByRole('heading', { name: 'Yangon Hikers' }).waitFor();
  const meta = await alice.locator('.community-meta').innerText();
  check('created private group page shows privacy + 1 member', /Private group/.test(meta) && /1 member\b/.test(meta), meta);
  check('creator sees Manage button', (await alice.getByRole('button', { name: 'Manage group' }).count()) === 1);
  await alice.getByText(/No posts yet/).waitFor();

  // Post in the group.
  await alice.getByRole('button', { name: 'Write a post' }).click();
  await alice.waitForURL(new RegExp(`/create-post\\?communityId=${gid}`));
  await alice.getByRole('heading', { name: 'Post in group' }).waitFor();
  check('composer in group mode has no audience picker', (await alice.getByText('Who can see this?').count()) === 0);
  await alice.locator('textarea').first().fill('First hike Saturday 7am');
  await alice.getByRole('button', { name: /^Post$/ }).click();
  await alice.waitForURL(`${WEB}/groups/${gid}`);
  await alice.locator('.post-card', { hasText: 'First hike Saturday 7am' }).waitFor();
  check('group post appears in the group feed', true);

  // Not in the main feed.
  await alice.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await alice.locator('.post-card').first().waitFor();
  check('group post is not in the home feed', (await alice.getByText('First hike Saturday 7am').count()) === 0);

  // Bob: discover, private locked, request.
  const bob = await newPage(bobToken, 2, 'bob');
  await bob.goto(`${WEB}/groups`, { waitUntil: 'networkidle' });
  await bob.getByRole('link', { name: /Yangon Hikers/ }).waitFor();
  check('bob sees the group under Discover', (await bob.getByRole('button', { name: 'Request to join Yangon Hikers' }).count()) === 1);
  await bob.getByRole('link', { name: /Yangon Hikers/ }).click();
  await bob.getByText('This group is private. Join to see its posts.').waitFor();
  check('non-member cannot see private posts', (await bob.getByText('First hike Saturday 7am').count()) === 0);
  await bob.getByRole('button', { name: 'Request to join' }).click();
  await bob.getByText('Your request is waiting for an admin.').waitFor();
  check('request -> pending state', (await bob.getByRole('button', { name: /Requested/ }).count()) === 1);

  // Alice approves on the manage screen.
  await alice.goto(`${WEB}/groups/${gid}/manage`, { waitUntil: 'networkidle' });
  await alice.getByRole('heading', { name: 'Join requests (1)' }).waitFor();
  await alice.getByRole('button', { name: 'Approve' }).click();
  await alice.getByRole('heading', { name: 'Members (2)' }).waitFor();
  check('approve moves bob into Members', (await alice.getByRole('heading', { name: 'Join requests (0)' }).count()) === 1);

  await bob.reload({ waitUntil: 'networkidle' });
  await bob.locator('.post-card', { hasText: 'First hike Saturday 7am' }).waitFor();
  check('approved member now sees the group feed', true);
  check('plain member has no Manage button', (await bob.getByRole('button', { name: 'Manage group' }).count()) === 0);

  // Bob posts; alice (admin) deletes it via the post menu.
  await bob.getByRole('button', { name: 'Write a post' }).click();
  await bob.locator('textarea').first().fill('bob selling stuff');
  await bob.getByRole('button', { name: /^Post$/ }).click();
  await bob.waitForURL(`${WEB}/groups/${gid}`);
  await bob.locator('.post-card', { hasText: 'bob selling stuff' }).waitFor();
  await alice.goto(`${WEB}/groups/${gid}`, { waitUntil: 'networkidle' });
  const bobCard = alice.locator('.post-card', { hasText: 'bob selling stuff' });
  await bobCard.waitFor();
  await bobCard.getByRole('button', { name: 'More options' }).click();
  await alice.getByRole('menuitem', { name: /Delete post \(group admin\)/ }).click();
  // PostMenu always confirms deletes -- wait for the dialog (a bare count()
  // raced its render and occasionally skipped the confirm).
  await alice.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await bobCard.waitFor({ state: 'detached' });
  check('group admin deletes a member\'s post', true);

  // Promote bob, then bob sees Manage.
  await alice.goto(`${WEB}/groups/${gid}/manage`, { waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: 'Make admin' }).click();
  await alice.getByText('Admin', { exact: true }).nth(1).waitFor();
  await bob.reload({ waitUntil: 'networkidle' });
  await bob.getByRole('button', { name: 'Manage group' }).waitFor();
  check('promoted member gets the Manage button', true);

  // Make public via manage.
  await alice.getByText('Public', { exact: true }).click();
  await alice.getByRole('button', { name: 'Save changes' }).click();
  await alice.getByText('Saved.').waitFor();
  const g = await (await call('GET', `/communities/${gid}`, aliceToken)).json();
  check('privacy switch saved', g.privacy === 'public', g.privacy);

  // Bob leaves via the confirm dialog.
  await bob.getByRole('button', { name: 'Leave' }).click();
  await bob.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await bob.getByRole('button', { name: 'Join group' }).waitFor();
  check('leave -> Join group button (public group stays readable)', (await bob.getByText('First hike Saturday 7am').count()) === 1);

  // Search.
  await bob.goto(`${WEB}/groups`, { waitUntil: 'networkidle' });
  await bob.getByLabel('Search groups').fill('zzz-nothing');
  await bob.getByText('No groups match that search.').waitFor();
  await bob.getByLabel('Search groups').fill('hikers');
  await bob.getByRole('link', { name: /Yangon Hikers/ }).waitFor();
  check('search filters groups', true);

  // Unknown group.
  expectedErrors = /404/;
  await bob.goto(`${WEB}/groups/999999`, { waitUntil: 'networkidle' });
  await bob.getByText('This group no longer exists.').waitFor();
  expectedErrors = null;
  check('unknown group -> friendly error', true);

  // Small dark layouts.
  for (const route of ['/groups', `/groups/${gid}`, `/groups/${gid}/manage`, '/groups/new']) {
    const small = await newPage(aliceToken, 1, 'alice', { width: 375, theme: 'dark' });
    await small.goto(WEB + route, { waitUntil: 'networkidle' });
    await small.locator('.screen-header-title').waitFor();
    await small.waitForTimeout(300);
    check(`375px dark ${route}: no horizontal scroll`, !(await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
    if (route === `/groups/${gid}`) await small.screenshot({ path: path.join(SP, 'b13-group-dark-375.png') });
    if (route === `/groups/${gid}/manage`) await small.screenshot({ path: path.join(SP, 'b13-manage-dark-375.png'), fullPage: true });
    await small.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
