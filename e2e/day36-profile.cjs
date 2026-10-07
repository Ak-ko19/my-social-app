// Day 36 step 1: profile links and joined date (headless Edge, throwaway
// stack: alice(1), bob(2)). Alice adds links in Edit Profile; a script link
// is refused with a message; bob (and a logged-out visitor) sees the links
// and "Joined <month year>" on her profile; Arabic dates; dark
// mode; RTL with the links kept left-to-right.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
const thisMonth = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      if (t) {
        localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
        localStorage.setItem('emailVerified', 'true');
      }
      localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [who ? tokens[who] : null, who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/400|Bad Request/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };

  // 1. Alice adds two links; a script link is refused first.
  const alice = await open('alice', '/edit-profile');
  const link1 = alice.getByRole('textbox', { name: 'Link 1' });
  await link1.waitFor({ timeout: 10000 });
  await link1.fill('javascript:alert(1)');
  await alice.getByRole('button', { name: 'Save Changes' }).click();
  await alice.getByRole('alert').waitFor({ timeout: 8000 }).catch(() => {});
  check('a script link is refused with a message', (await alice.getByRole('alert').textContent())?.includes('Links must be web addresses'));
  await link1.fill('tea.example');
  await alice.getByRole('button', { name: 'Add a link' }).click();
  await alice.getByRole('textbox', { name: 'Link 2' }).fill('https://shop.example.org/menu');
  await alice.getByRole('button', { name: 'Save Changes' }).click();
  await alice.getByRole('status').waitFor({ timeout: 8000 }).catch(() => {});
  check('saving two links succeeds', (await alice.getByRole('status').count()) === 1);
  check('up to 3: after a third, "Add a link" goes away', await (async () => {
    await alice.getByRole('button', { name: 'Add a link' }).click();
    return (await alice.getByRole('button', { name: 'Add a link' }).count()) === 0;
  })());
  await alice.reload({ waitUntil: 'networkidle' });
  await alice.getByRole('textbox', { name: 'Link 1' }).waitFor();
  check('reopening Edit Profile shows the saved, normalized links',
    (await alice.getByRole('textbox', { name: 'Link 1' }).inputValue()) === 'https://tea.example/'
    && (await alice.getByRole('textbox', { name: 'Link 2' }).inputValue()) === 'https://shop.example.org/menu');

  // 2. Bob, and a logged-out visitor, see them on alice's profile.
  for (const [who, label] of [['bob', 'bob'], [null, 'a logged-out visitor']]) {
    const p = await open(who, '/profile/1');
    await p.getByRole('list', { name: 'Links' }).waitFor({ timeout: 10000 }).catch(() => {});
    const links = p.getByRole('list', { name: 'Links' }).getByRole('link');
    const texts = await links.allTextContents();
    check(`${label} sees both links`, texts.join('|') === 'tea.example|shop.example.org/menu', texts.join('|'));
    check(`${label}: they open in a new tab, marked as user links`, (await links.first().getAttribute('target')) === '_blank' && (await links.first().getAttribute('rel')) === 'noopener noreferrer nofollow ugc');
    check(`${label} sees "Joined ${thisMonth}"`, (await p.getByText(`Joined ${thisMonth}`).count()) === 1);
    await p.context().close();
  }

  // 3. Arabic dates; dark; RTL keeps links left-to-right.
  for (const [theme, lang] of [['dark', 'en'], ['light', 'ar']]) {
    const p = await open('bob', '/profile/1', { theme, lang });
    await p.locator('.profile-joined').waitFor({ timeout: 10000 });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}/${lang}: links and date fit, no sideways scroll`, !overflow);
    if (lang === 'ar') {
      check('Arabic: "انضم في" and the page is RTL', (await p.locator('.profile-joined').innerText()).includes('انضم في') && (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
      check('...the links stay left-to-right', (await p.locator('.profile-link').first().getAttribute('dir')) === 'ltr');
    }
    await p.screenshot({ path: path.join(SP, `day36-profile-${theme}-${lang}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
