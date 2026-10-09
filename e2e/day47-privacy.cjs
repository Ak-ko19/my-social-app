// Day 47: privacy controls (headless Edge, throwaway stack: alice(1),
// bob(2)). Step 1, mute: alice follows bob, sees his post on Home, mutes
// him from the post's menu -- it leaves Home at once and stays gone after a
// reload; his profile and post still open, the profile says Unmute;
// Settings > Muted accounts lists him and unmutes. Arabic (RTL) + dark at
// 375px with axe. Bob is never told.
// Step 2, restrict: alice restricts bob from his profile; his comment on
// her post is seen only by him and her (marked for her), notifies her of
// nothing; she approves it, deletes another; Arabic held note and
// Settings > Restricted accounts.
// Step 3, close friends: alice adds bob (a follower) in Settings, posts
// for close friends from the composer (green star); bob sees it, logged
// out doesn't; a close-friends story rings green in bob's tray (Arabic);
// sharing a story to Close friends sends the flag; off the list, gone.
// Step 4, who can message / comment: alice picks "No one new" and "Your
// followers" in Settings; carol (new) sees Message off with the reason and
// can't comment; bob (follower) can. Arabic settings screen.
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

  // ---- Step 1: mute ----
  await api('alice', 'POST', '/users/2/follow');
  const form = new FormData();
  form.append('content', 'Bob posts a lot today');
  const bobPost = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.bob}` }, body: form })).json();
  const bobCard = (page) => page.locator('article.post-card', { hasText: 'Bob posts a lot today' });

  const alice = await open('alice', '/');
  await bobCard(alice).waitFor({ timeout: 10000 }).catch(() => {});
  check("bob's post is on alice's Home", (await bobCard(alice).count()) === 1);
  await bobCard(alice).getByRole('button', { name: 'More options' }).click();
  await alice.getByRole('menuitem', { name: 'Mute bob' }).click();
  await bobCard(alice).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  check('"Mute bob" takes his post off Home at once', (await bobCard(alice).count()) === 0);
  await alice.reload({ waitUntil: 'networkidle' });
  await alice.locator('article.post-card, .feed-empty, [role=status]').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('...and it stays off after a reload', (await bobCard(alice).count()) === 0);
  await alice.goto(`${WEB}/posts/${bobPost.id}`, { waitUntil: 'networkidle' });
  check('the post itself still opens', (await bobCard(alice).count()) === 1);
  await alice.goto(`${WEB}/profile/2`, { waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: 'More options' }).first().click();
  check('his profile offers "Unmute bob"', (await alice.getByRole('menuitem', { name: 'Unmute bob' }).count()) === 1);
  await alice.keyboard.press('Escape');
  check('bob is never told: nothing but the follow notification', sql("SELECT string_agg(type, ',') FROM notifications WHERE user_id = 2") === 'follow');

  await alice.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: /Muted accounts/ }).click();
  await alice.waitForURL(`${WEB}/settings/muted`, { timeout: 8000 }).catch(() => {});
  await alice.getByText('bob', { exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Settings > Muted accounts lists bob', (await alice.getByRole('button', { name: 'Unmute bob' }).count()) === 1);
  await axe(alice, 'en/light, Muted accounts');
  await alice.getByRole('button', { name: 'Unmute bob' }).click();
  await alice.getByText(/You haven't muted anyone/).waitFor({ timeout: 8000 }).catch(() => {});
  check('unmute from the list', (await alice.getByText(/You haven't muted anyone/).count()) === 1 && sql('SELECT COUNT(*) FROM user_mutes') === '0');
  await alice.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await bobCard(alice).waitFor({ timeout: 8000 }).catch(() => {});
  check("...and bob's post is back on Home", (await bobCard(alice).count()) === 1);
  await alice.context().close();

  // Arabic, dark, 375px: mute from the profile, then the list.
  const ar = await open('alice', '/profile/2', { lang: 'ar', theme: 'dark', width: 375 });
  await ar.getByRole('button', { name: AR.postMenu.moreOptions }).first().click();
  await ar.getByRole('menuitem', { name: AR.muted.muteName.replace('{{name}}', 'bob') }).click();
  await ar.getByRole('status').filter({ hasText: 'bob' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: muting from the profile says what it does, in Arabic', (await ar.getByText(AR.muted.mutedNote.replace('{{name}}', 'bob')).count()) === 1);
  await ar.goto(`${WEB}/settings/muted`, { waitUntil: 'networkidle' });
  await ar.getByRole('button', { name: AR.muted.unmuteName.replace('{{name}}', 'bob') }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: the list is right-to-left and translated', (await ar.evaluate(() => document.documentElement.dir)) === 'rtl'
    && (await ar.getByRole('heading', { name: AR.muted.title }).count()) === 1);
  check('ar: no sideways scroll at 375px', await noSideScroll(ar));
  await axe(ar, 'ar/dark, Muted accounts');
  await ar.screenshot({ path: path.join(SP, 'day47-muted-ar-dark-375.png') });
  await ar.context().close();
  await api('alice', 'DELETE', '/users/2/mute');

  // ---- Step 2: restrict ----
  const myForm = new FormData();
  myForm.append('content', 'Alice asks: best tea in town?');
  const myPost = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}` }, body: myForm })).json();
  const myCard = (page) => page.locator('article.post-card', { hasText: 'best tea in town' });
  const rp = await open('alice', '/profile/2');
  await rp.getByRole('button', { name: 'More options' }).first().click();
  await rp.getByRole('menuitem', { name: 'Restrict bob' }).click();
  await rp.getByRole('status').filter({ hasText: 'approval' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('"Restrict bob" from his profile, with a note on what it does', (await rp.getByText(/new comments on your posts will wait for your approval/).count()) === 1);
  await rp.context().close();
  const before = sql("SELECT COUNT(*) FROM notifications WHERE user_id = 1");
  const held = await (await api('bob', 'POST', `/posts/${myPost.id}/comments`, { content: 'Mine, obviously' })).json();
  await api('bob', 'POST', `/posts/${myPost.id}/like`);
  check("bob's comment and like notify alice of nothing", sql("SELECT COUNT(*) FROM notifications WHERE user_id = 1") === before);
  const publicComments = async () => (await (await fetch(`${API}/posts/${myPost.id}/comments`)).json()).map((c) => c.content);
  check('nobody else sees his comment yet', JSON.stringify(await publicComments()) === '[]');
  const bobSees = await (await api('bob', 'GET', `/posts/${myPost.id}/comments`)).json();
  check('bob sees it as an ordinary comment', bobSees.length === 1 && bobSees[0].awaiting_approval === false);

  const owner = await open('alice', `/posts/${myPost.id}`);
  await myCard(owner).getByRole('button', { name: 'Comment', exact: true }).click();
  await owner.getByText(/Restricted: only bob and you can see this comment/).waitFor({ timeout: 8000 }).catch(() => {});
  check('alice sees the held comment, marked', (await owner.getByText(/Restricted: only bob and you can see this comment/).count()) === 1);
  await owner.getByRole('button', { name: 'Approve' }).click();
  await owner.getByText(/Restricted: only bob/).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  check('Approve: everyone sees it now', JSON.stringify(await publicComments()) === JSON.stringify(['Mine, obviously']));
  // A second one, deleted by alice (the post's owner).
  await api('bob', 'POST', `/posts/${myPost.id}/comments`, { content: 'and another thing' });
  await owner.reload({ waitUntil: 'networkidle' });
  await myCard(owner).getByRole('button', { name: 'Comment', exact: true }).click();
  await owner.getByRole('button', { name: "Delete bob's comment" }).last().waitFor({ timeout: 8000 }).catch(() => {});
  await owner.getByRole('button', { name: "Delete bob's comment" }).last().click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await owner.getByText('and another thing').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  check('the post owner deletes his other comment', sql(`SELECT COUNT(*) FROM comments WHERE post_id = ${myPost.id}`) === '1');
  await axe(owner, 'en/light, post with comments');
  await owner.context().close();

  // Arabic, dark: a held comment, and the Restricted list.
  await api('bob', 'POST', `/posts/${myPost.id}/comments`, { content: 'one more' });
  const arOwner = await open('alice', `/posts/${myPost.id}`, { lang: 'ar', theme: 'dark', width: 375 });
  await myCard(arOwner).getByRole('button', { name: AR.feed.comment, exact: true }).click();
  const heldAr = AR.comments.held.replace('{{name}}', 'bob');
  await arOwner.getByText(heldAr).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: the held note in Arabic, with Approve', (await arOwner.getByText(heldAr).count()) === 1 && (await arOwner.getByRole('button', { name: AR.comments.approve }).count()) === 1);
  check('ar: no sideways scroll at 375px', await noSideScroll(arOwner));
  await arOwner.screenshot({ path: path.join(SP, 'day47-held-ar-dark-375.png') });
  await arOwner.goto(`${WEB}/settings/restricted`, { waitUntil: 'networkidle' });
  await arOwner.getByRole('button', { name: AR.restricted.unrestrictName.replace('{{name}}', 'bob') }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: Restricted accounts lists bob', (await arOwner.getByRole('heading', { name: AR.restricted.title }).count()) === 1);
  await axe(arOwner, 'ar/dark, Restricted accounts');
  await arOwner.getByRole('button', { name: AR.restricted.unrestrictName.replace('{{name}}', 'bob') }).click();
  await arOwner.waitForTimeout(500);
  check('unrestrict from the list', sql('SELECT COUNT(*) FROM user_restrictions') === '0');
  await arOwner.context().close();
  check("bob is never told about any of it", sql("SELECT string_agg(type, ',') FROM notifications WHERE user_id = 2") === 'follow');

  // ---- Step 3: close friends ----
  await api('bob', 'POST', '/users/1/follow');
  const cf = await open('alice', '/settings');
  await cf.getByRole('button', { name: /Close friends/ }).click();
  await cf.waitForURL(`${WEB}/settings/close-friends`, { timeout: 8000 }).catch(() => {});
  await cf.getByRole('button', { name: 'Add bob to close friends' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Settings > Close friends offers bob (he follows alice)', (await cf.getByRole('button', { name: 'Add bob to close friends' }).count()) === 1);
  await cf.getByRole('button', { name: 'Add bob to close friends' }).click();
  await cf.getByRole('heading', { name: 'On your list (1)' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('...added: "On your list (1)"', sql('SELECT friend_id FROM close_friends WHERE user_id = 1') === '2');
  await axe(cf, 'en/light, Close friends');

  // A close-friends post from the composer.
  await cf.goto(`${WEB}/create-post`, { waitUntil: 'networkidle' });
  await cf.getByRole('textbox', { name: 'Post' }).fill('Only for my close friends');
  await cf.getByRole('radio', { name: 'Close friends' }).check();
  await cf.getByRole('button', { name: 'Post', exact: true }).click();
  await cf.waitForURL(`${WEB}/`, { timeout: 10000 }).catch(() => {});
  const cfPostId = sql("SELECT id FROM posts WHERE content = 'Only for my close friends'");
  check('the composer posts it for close friends', sql(`SELECT visibility FROM posts WHERE id = ${cfPostId || 0}`) === 'close_friends');
  const cfCard = (page) => page.locator('article.post-card', { hasText: 'Only for my close friends' });
  await cfCard(cf).waitFor({ timeout: 8000 }).catch(() => {});
  check('its card shows the green close-friends star', (await cfCard(cf).locator('.post-card-audience-close-friends').count()) === 1);
  await cf.context().close();

  const bobHome = await open('bob', '/');
  await cfCard(bobHome).waitFor({ timeout: 8000 }).catch(() => {});
  check("bob (on the list) sees it on his Home", (await cfCard(bobHome).count()) === 1);
  await bobHome.context().close();
  check('logged out, it is not found', (await fetch(`${API}/posts/${cfPostId}`)).status === 404);

  // A close-friends story: bob's tray shows alice's ring in green.
  sql("INSERT INTO stories (user_id, media_url, close_friends) VALUES (1, 'http://localhost:5173/icon-192.png', true)");
  const bobStories = await open('bob', '/', { lang: 'ar', theme: 'dark', width: 375 });
  await bobStories.locator('.stories-item').nth(1).waitFor({ timeout: 8000 }).catch(() => {});
  const ring = await bobStories.locator('.stories-item').nth(1).locator('[style*="--color-close-friends"]').count();
  check("ar: alice's close-friends story has the green ring in bob's tray", ring === 1);
  check('ar: the close-friends post shows in Arabic with its star', (await cfCard(bobStories).locator('.post-card-audience-close-friends').count()) === 1
    && (await cfCard(bobStories).locator('.post-card-audience-close-friends').getAttribute('title')) === AR.feed.audienceCloseFriends);
  await bobStories.screenshot({ path: path.join(SP, 'day47-closefriends-ar-dark-375.png') });
  await bobStories.context().close();

  // Sharing a story to close friends sends the flag.
  const sharer = await open('alice', '/');
  let storyForm = '';
  await sharer.route('**/stories', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    storyForm = route.request().postDataBuffer().toString('latin1');
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 999 }) });
  });
  await sharer.locator('.stories-row input[type=file]').setInputFiles(path.join(SP, '..', 'frontend', 'public', 'icon-192.png'));
  await sharer.getByRole('menuitem', { name: 'Close friends' }).click();
  await sharer.waitForTimeout(800);
  check('"Share to > Close friends" sends closeFriends=true', /name="closeFriends"\r\n\r\ntrue/.test(storyForm));
  await sharer.context().close();

  // Off the list: the post is gone for bob.
  await api('alice', 'DELETE', '/close-friends/2');
  check('removed from the list: bob gets 404', (await api('bob', 'GET', `/posts/${cfPostId}`)).status === 404);

  // ---- Step 4: who can message / comment ----
  // carol: a new account that has never talked to alice.
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'carol47', email: 'carol47@example.com', password: 'a-fine-password-123' }) });
  tokens.carol = (await (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'carol47@example.com', password: 'a-fine-password-123' }) })).json()).token;
  const carolId = Number(sql("SELECT id FROM users WHERE username = 'carol47'"));

  const settings = await open('alice', '/settings');
  await settings.getByRole('button', { name: /Messages and comments/ }).click();
  await settings.waitForURL(`${WEB}/settings/interactions`, { timeout: 8000 }).catch(() => {});
  await settings.getByRole('radio', { name: 'No one new' }).waitFor({ timeout: 8000 }).catch(() => {});
  await settings.getByRole('radio', { name: 'No one new' }).check();
  await settings.getByText('Saved.').waitFor({ timeout: 8000 }).catch(() => {});
  await settings.getByRole('radio', { name: 'Your followers' }).check();
  await settings.waitForTimeout(600);
  check('Settings > Messages and comments saves both', sql('SELECT message_permission || \',\' || comment_permission FROM users WHERE id = 1') === 'nobody,followers');
  await axe(settings, 'en/light, Messages and comments');
  await settings.context().close();

  // carol: the Message button says why it's off; the API agrees.
  const carolCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await carolCtx.addInitScript(([t, id]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', 'carol47'); localStorage.setItem('emailVerified', 'true');
  }, [tokens.carol, carolId]);
  const carol = await carolCtx.newPage();
  carol.on('pageerror', (e) => errors.push(`carol: ${e.message}`));
  await carol.goto(`${WEB}/profile/1`, { waitUntil: 'networkidle' });
  await carol.getByText("alice isn't accepting messages from you.").waitFor({ timeout: 8000 }).catch(() => {});
  check('carol: Message is off, and says why', await carol.getByRole('button', { name: 'Message', exact: true }).isDisabled()
    && (await carol.getByText("alice isn't accepting messages from you.").count()) === 1);
  await carolCtx.close();
  const carolChat = await (await api('carol', 'POST', '/conversations', { userId: 1 })).text();
  check("carol can't start a chat with alice", carolChat === "This person isn't accepting messages from you");
  check("carol can't comment (not a follower)", (await api('carol', 'POST', `/posts/${myPost.id}/comments`, { content: 'hi' })).status === 403);
  check('bob (a follower) still can', (await api('bob', 'POST', `/posts/${myPost.id}/comments`, { content: 'hi again' })).status === 201);

  // Arabic, dark, 375px: the settings screen.
  const arSettings = await open('alice', '/settings/interactions', { lang: 'ar', theme: 'dark', width: 375 });
  await arSettings.getByRole('radio', { name: AR.interactions.message.nobody }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: the settings in Arabic, right to left', (await arSettings.getByRole('radio', { name: AR.interactions.message.nobody }).isChecked())
    && (await arSettings.evaluate(() => document.documentElement.dir)) === 'rtl');
  check('ar: no sideways scroll at 375px', await noSideScroll(arSettings));
  await axe(arSettings, 'ar/dark, Messages and comments');
  await arSettings.screenshot({ path: path.join(SP, 'day47-interactions-ar-dark-375.png') });
  await arSettings.context().close();
  await api('alice', 'PUT', '/profile/interactions', { messagePermission: 'everyone', commentPermission: 'everyone' });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
