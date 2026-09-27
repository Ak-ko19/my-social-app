// B14 Pages in headless Edge (fresh throwaway stack from e2e-up.sh).
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

  // Bob creates a page from the Menu.
  const bob = await newPage(bobToken, 2, 'bob');
  await bob.goto(`${WEB}/menu`, { waitUntil: 'networkidle' });
  await bob.getByRole('button', { name: /^Pages/ }).click();
  await bob.waitForURL(`${WEB}/pages`);
  await bob.getByText("You don't follow any pages yet.").waitFor();
  check('Menu Pages row opens /pages', true);
  await bob.getByRole('button', { name: /Create/ }).click();
  await bob.getByLabel('Page name').fill('Mingalar Tea House');
  await bob.getByLabel('Category').selectOption('business');
  await bob.getByLabel('About (optional)').fill('Tea leaf salad and milk tea');
  await bob.getByRole('button', { name: 'Create page' }).click();
  await bob.waitForURL(/\/pages\/\d+$/);
  const pid = bob.url().match(/pages\/(\d+)/)[1];
  await bob.getByRole('heading', { name: 'Mingalar Tea House' }).waitFor();
  check('page shows category + 0 followers', /Business · 0 followers/.test(await bob.locator('.community-meta').innerText()));
  check('owner sees Edit, not Follow', (await bob.getByRole('button', { name: 'Edit page' }).count()) === 1 && (await bob.getByRole('button', { name: 'Follow' }).count()) === 0);

  // Post as the page.
  await bob.getByRole('button', { name: 'Post as page' }).click();
  await bob.getByRole('heading', { name: 'Post as page' }).waitFor();
  check('composer: no audience picker for page posts', (await bob.getByText('Who can see this?').count()) === 0);
  await bob.locator('textarea').first().fill('Grand opening this Saturday!');
  await bob.getByRole('button', { name: /^Post$/ }).click();
  await bob.waitForURL(`${WEB}/pages/${pid}`);
  const card = bob.locator('.post-card', { hasText: 'Grand opening this Saturday!' });
  await card.waitFor();
  check('page post is authored as the page', (await card.locator('.post-card-author').innerText()) === 'Mingalar Tea House');
  await card.getByRole('button', { name: 'More options' }).click();
  check('owner menu has no audience switch on page posts', (await bob.getByRole('menuitem', { name: /Followers|Public|audience/i }).count()) === 0);
  await bob.keyboard.press('Escape');
  await bob.goto(`${WEB}/profile/2`, { waitUntil: 'networkidle' });
  await bob.waitForTimeout(800);
  check("page post is not on the owner's profile", (await bob.getByText('Grand opening this Saturday!').count()) === 0);

  // Alice discovers and follows; post shows in her Home feed as the page.
  const alice = await newPage(aliceToken, 1, 'alice');
  await alice.goto(`${WEB}/pages`, { waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: 'Follow Mingalar Tea House' }).click();
  await alice.getByRole('heading', { name: 'Following' }).waitFor();
  await alice.locator('.group-list').first().getByText('Mingalar Tea House').waitFor();
  check('follow from Discover moves the page into Following', true);
  // Alice already follows bob personally (seed), so unfollow bob to prove the page follow is what delivers it.
  await fetch(`${API}/users/2/follow`, { method: 'DELETE', headers: { Authorization: `Bearer ${aliceToken}` } });
  await alice.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const homeCard = alice.locator('article.post-card', { hasText: 'Grand opening this Saturday!' });
  await homeCard.waitFor();
  check('followed page post appears in Home feed', true);
  await homeCard.getByRole('link', { name: 'Mingalar Tea House' }).click();
  await alice.waitForURL(`${WEB}/pages/${pid}`);
  await alice.getByRole('button', { name: 'Following' }).waitFor();
  check('page name on a post links to the page (Following state)', /1 follower\b/.test(await alice.locator('.community-meta').innerText()));
  await alice.getByRole('button', { name: 'Following' }).click();
  await alice.getByRole('button', { name: 'Follow' }).waitFor();
  check('unfollow from the page', /0 followers/.test(await alice.locator('.community-meta').innerText()));

  // Search.
  await alice.goto(`${WEB}/pages`, { waitUntil: 'networkidle' });
  await alice.getByLabel('Search pages').fill('nothing-like-this');
  await alice.getByText('No pages match that search.').waitFor();
  await alice.getByLabel('Search pages').fill('tea');
  await alice.getByRole('link', { name: /Mingalar Tea House/ }).waitFor();
  check('search filters pages', true);

  // Non-owner opening the edit URL.
  await alice.goto(`${WEB}/pages/${pid}/edit`, { waitUntil: 'networkidle' });
  await alice.getByText('Only the page owner can edit this page.').waitFor();
  check('non-owner cannot edit', true);

  // Owner edits then deletes.
  await bob.goto(`${WEB}/pages/${pid}/edit`, { waitUntil: 'networkidle' });
  await bob.getByLabel('Category').selectOption('creator');
  await bob.getByRole('button', { name: 'Save changes' }).click();
  await bob.getByText('Saved.').waitFor();
  await bob.getByRole('button', { name: 'Delete page' }).click();
  const dialog = bob.getByRole('dialog');
  const confirmBtn = dialog.getByRole('button', { name: 'Delete page' });
  check('delete stays disabled until the name is typed', await confirmBtn.isDisabled());
  await dialog.getByLabel('Type Mingalar Tea House to confirm').fill('Mingalar Tea House');
  await confirmBtn.click();
  await bob.waitForURL(`${WEB}/pages`);
  const gone = await fetch(`${API}/pages/${pid}`);
  check('page deleted', gone.status === 404);

  // Unknown page.
  expectedErrors = /404/;
  await bob.goto(`${WEB}/pages/${pid}`, { waitUntil: 'networkidle' });
  await bob.getByText('This page is not available.').waitFor();
  expectedErrors = null;
  check('deleted page -> friendly error', true);

  // Small dark layouts (fresh page for the matrix).
  const created = await (await fetch(`${API}/pages`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'A rather long page name for layout checks', category: 'organization', description: 'x'.repeat(300) }) })).json();
  const f = new FormData(); f.append('content', 'Layout post'); f.append('pageId', String(created.id));
  await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}` }, body: f });
  for (const route of ['/pages', `/pages/${created.id}`, `/pages/${created.id}/edit`, '/pages/new']) {
    const small = await newPage(bobToken, 2, 'bob', { width: 375, theme: 'dark' });
    await small.goto(WEB + route, { waitUntil: 'networkidle' });
    await small.locator('.screen-header-title').waitFor();
    await small.waitForTimeout(300);
    check(`375px dark ${route}: no horizontal scroll`, !(await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
    if (route === `/pages/${created.id}`) await small.screenshot({ path: path.join(SP, 'b14-page-dark-375.png') });
    await small.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
