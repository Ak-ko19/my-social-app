// Day 36 step 2: cover photo (headless Edge, throwaway stack: alice(1),
// bob(2)). The stack has no Cloudinary, so a real upload fails: that must
// show an error (the upload itself is covered by coverPhoto.test.js). The
// cover is then set in the database to an image this site serves: bob sees
// it on alice's profile with her avatar overlapping it; alice removes it in
// Edit Profile; dark and Arabic (RTL).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const PHOTO = `${WEB}/icon-512.png`;
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -c "${q}"`);
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/502|Bad Gateway/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };

  // 1. No cover yet; an upload that fails says so.
  const edit = await open('alice', '/edit-profile');
  await edit.getByText('Add cover photo').waitFor({ timeout: 10000 });
  check('Edit Profile offers "Add cover photo" (no Remove yet)', (await edit.getByRole('button', { name: 'Remove cover photo' }).count()) === 0);
  await edit.locator('.edit-profile-cover-actions input[type=file]').setInputFiles(path.join(SP, '..', 'frontend', 'public', 'icon-192.png'));
  await edit.locator('.edit-profile-cover [role=alert]').waitFor({ timeout: 10000 }).catch(() => {});
  check('an upload that fails shows an error', (await edit.locator('.edit-profile-cover [role=alert]').count()) === 1);

  // 2. With a cover: bob sees it on alice's profile.
  sql(`UPDATE users SET cover_url = '${PHOTO}' WHERE id = 1`);
  const bob = await open('bob', '/profile/1');
  const cover = bob.locator('.profile-cover img');
  await cover.waitFor({ timeout: 10000 }).catch(() => {});
  check('bob sees alice\'s cover', (await cover.count()) === 1);
  check('...the image loads', await cover.evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false));
  const coverBox = await bob.locator('.profile-cover').boundingBox();
  const avatarBox = await bob.locator('.profile-screen-body .ui-avatar').first().boundingBox();
  const column = await bob.locator('.profile-screen-header').boundingBox();
  check('the cover spans the app column at 3:1', coverBox && column && Math.abs(coverBox.width - column.width) <= 1 && Math.abs(coverBox.width / coverBox.height - 3) < 0.05, JSON.stringify({ coverBox, column: column && column.width }));
  check('the avatar overlaps the cover\'s bottom edge', avatarBox && coverBox && avatarBox.y < coverBox.y + coverBox.height && avatarBox.y + avatarBox.height > coverBox.y + coverBox.height);

  // 3. Alice removes it.
  await edit.reload({ waitUntil: 'networkidle' });
  await edit.getByRole('button', { name: 'Remove cover photo' }).click();
  await edit.getByText('Add cover photo').waitFor({ timeout: 8000 }).catch(() => {});
  check('Remove cover photo works in Edit Profile', (await edit.getByText('Add cover photo').count()) === 1);
  await bob.reload({ waitUntil: 'networkidle' });
  await bob.locator('.profile-cover').waitFor();
  check('bob now sees the plain band, no image', (await bob.locator('.profile-cover img').count()) === 0 && (await bob.locator('.profile-cover-empty').count()) === 1);

  // 4. Dark and Arabic with a cover.
  sql(`UPDATE users SET cover_url = '${PHOTO}' WHERE id = 1`);
  for (const [theme, lang] of [['dark', 'en'], ['light', 'ar']]) {
    const p = await open('bob', '/profile/1', { theme, lang });
    await p.locator('.profile-cover img').waitFor({ timeout: 10000 }).catch(() => {});
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}/${lang}: cover shows, no sideways scroll`, (await p.locator('.profile-cover img').count()) === 1 && !overflow);
    if (lang === 'ar') check('Arabic page is right-to-left', (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
    await p.screenshot({ path: path.join(SP, `day36-cover-${theme}-${lang}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
