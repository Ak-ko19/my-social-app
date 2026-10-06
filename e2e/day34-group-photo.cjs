// Day 34: group photo (headless Edge, throwaway stack: alice(1), bob(2)).
// The stack has no Cloudinary, so a real upload fails here: that failure
// must show an error (the upload itself is covered by groupPhoto.test.js).
// The photo is then set straight in the database to an image this site
// serves, and the suite checks where it shows: the inbox, the chat header,
// group info; admin vs member controls; removing it updates the member's
// open screen live. Dark and Arabic (RTL).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const PHOTO = `${WEB}/icon-192.png`;
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -c "${q}"`);

(async () => {
  const users = {
    alice: { id: 1, token: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim() },
    bob: { id: 2, token: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() }
  };
  const group = await fetch(`${API}/conversations/groups`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${users.alice.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Photo club', userIds: [users.bob.id] })
  }).then((r) => r.json());

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [users[who].token, users[who].id, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    // The failed upload below is expected to log a 502.
    page.on('console', (m) => { if (m.type() === 'error' && !/502|Bad Gateway/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const photoIn = (page, scope) => page.locator(`${scope} img.messages-group-photo`);

  // 1. No photo yet: the glyph, and admins are offered "Add photo".
  const alice = await open('alice', `/messages/${group.id}/info`);
  await alice.locator('.group-member-row').nth(1).waitFor({ timeout: 10000 });
  check('no photo yet: the group glyph shows', (await alice.locator('.group-photo-block .messages-group-avatar').count()) === 1);
  check('the admin is offered Add photo (no Remove yet)', (await alice.getByText('Add photo').count()) === 1 && (await alice.getByRole('button', { name: 'Remove photo' }).count()) === 0);

  // 2. A failed upload says so.
  await alice.locator('.group-photo-actions input[type=file]').setInputFiles(path.join(SP, '..', 'frontend', 'public', 'icon-192.png'));
  await alice.getByRole('alert').waitFor({ timeout: 10000 }).catch(() => {});
  check('an upload that fails shows an error', (await alice.getByRole('alert').count()) === 1, await alice.getByRole('alert').textContent().catch(() => ''));
  check('...and the button is usable again', (await alice.getByText('Add photo').count()) === 1);

  // 3. With a photo: everywhere it should be.
  sql(`UPDATE conversations SET avatar_url = '${PHOTO}' WHERE id = ${group.id}`);
  const bob = await open('bob', `/messages/${group.id}/info`);
  await bob.locator('.group-member-row').nth(1).waitFor({ timeout: 10000 });
  check('group info shows the photo', (await photoIn(bob, '.group-photo-block').count()) === 1);
  check('a member gets no photo controls', (await bob.getByText(/Add photo|Change photo/).count()) === 0 && (await bob.getByRole('button', { name: 'Remove photo' }).count()) === 0);
  const inbox = await open('bob', '/messages');
  await inbox.getByText('Photo club').waitFor({ timeout: 10000 });
  check('the inbox shows the photo for the group', (await photoIn(inbox, '.messages-row').count()) === 1);
  const chat = await open('bob', `/messages/${group.id}`);
  await chat.locator('.conversation-header').waitFor();
  await photoIn(chat, '.conversation-header').waitFor({ timeout: 8000 }).catch(() => {});
  check('the chat header shows it', (await photoIn(chat, '.conversation-header').count()) === 1);
  const loaded = await photoIn(chat, '.conversation-header').evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false);
  check('...and the image actually loads', loaded);

  // 4. The admin removes it; bob's open group info updates live.
  await alice.reload({ waitUntil: 'networkidle' });
  await alice.getByRole('button', { name: 'Remove photo' }).click();
  await bob.locator('.group-photo-block .messages-group-avatar').waitFor({ timeout: 8000 }).catch(() => {});
  check('removing it shows the glyph again, live on bob\'s screen', (await bob.locator('.group-photo-block .messages-group-avatar').count()) === 1);
  check('...and alice is offered Add photo again', (await alice.getByText('Add photo').count()) === 1);

  // 5. Dark and Arabic, with a photo.
  sql(`UPDATE conversations SET avatar_url = '${PHOTO}' WHERE id = ${group.id}`);
  for (const [theme, lang, change] of [['dark', 'en', 'Change photo'], ['light', 'ar', 'تغيير الصورة']]) {
    const p = await open('alice', `/messages/${group.id}/info`, { theme, lang });
    await p.locator('.group-member-row').nth(1).waitFor({ timeout: 10000 });
    const block = await p.locator('.group-photo-block').boundingBox();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}/${lang}: photo and its buttons fit, no sideways scroll`, (await p.getByText(change).count()) === 1 && block && block.x >= 0 && block.x + block.width <= 391 && !overflow);
    if (lang === 'ar') check('Arabic page is right-to-left', (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
    await p.screenshot({ path: path.join(SP, `day34-group-photo-${theme}-${lang}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
