// Day 46: saved collections (headless Edge, throwaway stack: alice(1),
// bob(2)). From a post's ⋯ menu, alice saves bob's post into a new
// "Recipes" collection made right in the sheet (the post shows Saved);
// Saved shows the collection's card; it opens, renames, takes a second
// collection; unsaving the post empties both; deleting a collection asks
// first and keeps the posts saved. Arabic (RTL) + dark at 375px with axe
// on Saved and on the sheet. Collections are private.
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

(async () => {
  // Bob posts something worth saving.
  const form = new FormData();
  form.append('content', 'Mohinga recipe: toast the rice flour first');
  const bobPost = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.bob}` }, body: form })).json();

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    // Bob opening alice's collection gets the 404 on purpose (step 8).
    page.on('console', (m) => { if (m.type() === 'error' && !(who === 'bob' && /404/.test(m.text()))) errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const axe = async (page, selector, label) => {
    await page.waitForTimeout(400); // screen and sheet animations
    await page.evaluate(AXE);
    const r = await page.evaluate((sel) => window.axe.run(document.querySelector(sel), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }), selector);
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };
  const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const card = (page) => page.locator('article.post-card', { hasText: 'Mohinga recipe' });

  // 1. From the post's menu: a new collection, made in the sheet.
  const alice = await open('alice', `/posts/${bobPost.id}`);
  await card(alice).waitFor({ timeout: 10000 });
  await card(alice).getByRole('button', { name: 'More options' }).click();
  await alice.getByRole('menuitem', { name: 'Save to collection' }).click();
  await alice.getByText('No collections yet — create one below.').waitFor({ timeout: 8000 }).catch(() => {});
  check('the sheet says there are no collections yet', (await alice.getByText('No collections yet — create one below.').count()) === 1);
  await alice.getByRole('textbox', { name: 'New collection' }).fill('Recipes');
  await alice.getByRole('button', { name: 'Create' }).click();
  await alice.getByRole('checkbox', { name: 'Recipes' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('...made in place, and ticked', await alice.getByRole('checkbox', { name: 'Recipes' }).isChecked().catch(() => false));
  await alice.getByRole('button', { name: 'Done' }).click();
  await alice.getByRole('dialog').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  check('Done saves the post: its button says Saved', (await card(alice).getByRole('button', { name: 'Saved' }).getAttribute('aria-pressed')) === 'true');
  check('...and it is in the collection', sql(`SELECT c.name FROM bookmark_collection_items i JOIN bookmark_collections c ON c.id = i.collection_id JOIN bookmarks b ON b.id = i.bookmark_id WHERE b.post_id = ${bobPost.id}`) === 'Recipes');

  // 2. Saved: the card, then the collection.
  await alice.goto(`${WEB}/saved`, { waitUntil: 'networkidle' });
  const recipes = alice.getByRole('link', { name: /Recipes/ });
  await recipes.waitFor({ timeout: 8000 }).catch(() => {});
  check('Saved shows the collection: "Recipes · 1 post"', (await recipes.innerText()).includes('1 post'), await recipes.innerText().catch(() => ''));
  await recipes.click();
  await alice.getByRole('heading', { name: 'Recipes' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('it opens with the post', (await card(alice).count()) === 1);

  // 3. Rename it.
  await alice.getByRole('button', { name: 'Collection options' }).click();
  await alice.getByRole('menuitem', { name: 'Rename collection' }).click();
  await alice.getByRole('textbox', { name: 'Name' }).fill('Burmese recipes');
  await alice.getByRole('button', { name: 'Save', exact: true }).click();
  await alice.getByRole('heading', { name: 'Burmese recipes' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('rename shows at once', (await alice.getByRole('heading', { name: 'Burmese recipes' }).count()) === 1);

  // 4. A second collection from Saved, and the post goes in both.
  await alice.goto(`${WEB}/saved`, { waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: 'New collection' }).click();
  await alice.getByRole('dialog').getByRole('textbox', { name: 'Name' }).fill('To cook');
  await alice.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await alice.getByRole('link', { name: /To cook/ }).waitFor({ timeout: 8000 }).catch(() => {});
  check('a collection made on Saved shows first, empty', (await alice.locator('.collection-card .collection-name').allInnerTexts()).join('|') === 'New collection|To cook|Burmese recipes');
  await card(alice).getByRole('button', { name: 'More options' }).click();
  await alice.getByRole('menuitem', { name: 'Save to collection' }).click();
  await alice.getByRole('checkbox', { name: 'To cook' }).check();
  await alice.getByRole('button', { name: 'Done' }).click();
  await alice.getByRole('dialog').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  check('a post can be in two collections', sql(`SELECT COUNT(*) FROM bookmark_collection_items`) === '2');

  // 5. Unsave it: out of both, counts go to 0.
  await card(alice).getByRole('button', { name: 'Saved' }).click();
  await alice.waitForTimeout(500);
  await alice.goto(`${WEB}/saved`, { waitUntil: 'networkidle' });
  await alice.locator('.collection-count').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('unsaving empties its collections', (await alice.locator('.collection-count').allInnerTexts()).join('|') === '0 posts|0 posts');

  // 6. Delete a collection: asks, then gone; saved posts stay.
  await fetch(`${API}/posts/${bobPost.id}/bookmark`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}` } });
  await alice.getByRole('link', { name: /To cook/ }).click();
  await alice.getByRole('button', { name: 'Collection options' }).click();
  await alice.getByRole('menuitem', { name: 'Delete collection' }).click();
  const dialog = alice.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Delete "To cook"?' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('delete asks first', (await dialog.getByRole('heading', { name: 'Delete "To cook"?' }).count()) === 1);
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await alice.waitForURL(`${WEB}/saved`, { timeout: 8000 }).catch(() => {});
  await alice.locator('.collection-card').nth(1).waitFor({ timeout: 8000 }).catch(() => {});
  check('...back on Saved, it is gone', (await alice.getByRole('link', { name: /To cook/ }).count()) === 0);
  await card(alice).waitFor({ timeout: 8000 }).catch(() => {});
  check('...and the post is still saved', (await card(alice).count()) === 1);
  await alice.context().close();

  // 7. Arabic, dark, 375px.
  const ar = await open('alice', '/saved', { lang: 'ar', theme: 'dark', width: 375 });
  await ar.locator('.collection-card').nth(1).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: right-to-left, "القوائم" and "كل المنشورات المحفوظة"', (await ar.evaluate(() => document.documentElement.dir)) === 'rtl'
    && (await ar.getByRole('heading', { name: AR.collections.title }).count()) === 1 && (await ar.getByRole('heading', { name: AR.collections.allSaved }).count()) === 1);
  check('ar: the empty collection reads "لا منشورات"', (await ar.locator('.collection-count').first().innerText()) === AR.collections.posts_zero, await ar.locator('.collection-count').first().innerText());
  check('ar: no sideways scroll at 375px', await noSideScroll(ar));
  await axe(ar, '.screen-enter', 'ar/dark, Saved');
  await ar.screenshot({ path: path.join(SP, 'day46-saved-ar-dark-375.png') });
  await card(ar).getByRole('button', { name: AR.postMenu.moreOptions }).click();
  await ar.getByRole('menuitem', { name: AR.collections.menuItem }).click();
  await ar.getByRole('checkbox').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: the sheet in Arabic', (await ar.getByRole('heading', { name: AR.collections.sheetTitle }).count()) === 1);
  await axe(ar, '.save-collection-sheet', 'ar/dark, Save to collection sheet');
  await ar.screenshot({ path: path.join(SP, 'day46-sheet-ar-dark-375.png') });
  await ar.context().close();

  // 8. Private.
  const mine = sql('SELECT id FROM bookmark_collections LIMIT 1');
  check("bob can't open alice's collection", (await fetch(`${API}/collections/${mine}/posts`, { headers: { Authorization: `Bearer ${tokens.bob}` } })).status === 404);
  const bob = await open('bob', `/saved/collections/${mine}`);
  check("...and the screen says it doesn't exist", (await bob.getByText("This collection doesn't exist any more.").count()) === 1);
  await bob.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
