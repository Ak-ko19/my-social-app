// Day 78: the first-run steps. A new account signs up and logs in through
// the real forms and lands on "Get started": language, a profile photo
// (uploaded for real to the Cloudinary stand-in), then Home -- and the
// next login goes straight Home. In Arabic (dark, RTL) the cards are
// walked to the tour and skipped from there. The seed accounts never see them.
// Media stack (E2E_MEDIA=1, run-all.sh MEDIA_SUITES).
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const EN = require('../frontend/src/i18n/locales/en.json');
const AR = require('../frontend/src/i18n/locales/ar.json');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const PASSWORD = 'a-fine-password-123';
const PHOTO = path.join(__dirname, '../frontend/public/icon-512.png');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const shows = (locator) => locator.waitFor({ timeout: 10000 }).then(() => true, () => false);
const me = async (token) => (await fetch(`${API}/profile/me`, { headers: { Authorization: `Bearer ${token}` } })).json();

async function logInWithForm(page, L, name) {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel(L.auth.email, { exact: true }).fill(`${name}@example.com`);
  await page.getByLabel(L.auth.password, { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: L.auth.logIn, exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async ({ lang, theme, width }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([l, th]) => { localStorage.setItem('lang', l); localStorage.setItem('theme', th); }, [lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${lang}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
    return { ctx, page };
  };
  const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

  // The seed account: straight Home.
  {
    const { ctx, page } = await newPage({ lang: 'en', theme: 'light', width: 390 });
    await logInWithForm(page, EN, 'alice');
    check('a seed account logs in to Home, not the first-run steps', new URL(page.url()).pathname === '/', page.url());
    await ctx.close();
  }

  // EN / light / 390 px: sign up through the form, then every card.
  {
    const T = EN.onboarding;
    const { ctx, page } = await newPage({ lang: 'en', theme: 'light', width: 390 });
    await page.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });
    await page.getByLabel('Username').fill('nora78');
    await page.getByLabel('Email').fill('nora78@example.com');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await logInWithForm(page, EN, 'nora78');
    check('en: the first login opens Get started', page.url().endsWith('/get-started'), page.url());
    check('en: it welcomes by name', await shows(page.getByRole('heading', { name: T.welcome.replace('{{username}}', 'nora78') })));
    check('en: step 1 of 4', await shows(page.getByRole('list', { name: T.progress.replace('{{step}}', '1').replace('{{total}}', '4') })));
    check('en: no tab bar on the steps', (await page.locator('.bottom-tab-bar').count()) === 0);
    check('en: no horizontal scroll', await noSideScroll(page));
    await page.waitForTimeout(700); // the card's entrance animation
    await page.screenshot({ path: path.join(SP, 'day78-onboarding-language-en-light-390.png') });

    await page.getByRole('button', { name: T.next, exact: true }).click();
    check('en: card 2 is the photo', await shows(page.getByRole('heading', { name: T.photoTitle })));
    await page.locator('input[type=file]').setInputFiles(PHOTO);
    check('en: the photo is saved', await shows(page.getByRole('status').filter({ hasText: T.photoSaved })));
    const img = page.getByRole('img', { name: T.photoAlt });
    check('en: ...and shown', await shows(img) && /cloudinary|localhost:3904/.test((await img.getAttribute('src')) || ''), await img.getAttribute('src').catch(() => ''));
    await page.waitForTimeout(700); // the card's entrance animation
    await page.screenshot({ path: path.join(SP, 'day78-onboarding-photo-en-light-390.png') });

    const token = await page.evaluate(() => localStorage.getItem('token'));
    check('en: the account has the photo', Boolean((await me(token)).avatar_url));
    // Card 3: people to follow (a new account: the most-followed accounts).
    await page.getByRole('button', { name: T.next, exact: true }).click();
    const people = page.getByRole('list', { name: T.peopleTitle });
    check('en: card 3 suggests people', await shows(people));
    const bobRow = people.locator('li', { hasText: 'bob' });
    check('en: ...bob among them', await shows(bobRow));
    await bobRow.getByRole('button', { name: /^Follow/ }).click();
    check('en: following happens in place', await shows(bobRow.getByRole('button', { name: /^Following|^Unfollow/ })));
    check('en: no horizontal scroll (people)', await noSideScroll(page));
    await page.waitForTimeout(700); // the card's entrance animation
    await page.screenshot({ path: path.join(SP, 'day78-onboarding-people-en-light-390.png') });

    // Card 4: the tour.
    await page.getByRole('button', { name: T.next, exact: true }).click();
    check('en: card 4 is the tour', await shows(page.getByRole('heading', { name: T.tourTitle })));
    check('en: ...naming Home, Search, Messages and Menu', (await page.locator('.onboarding-tour-item').count()) === 4);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SP, 'day78-onboarding-tour-en-light-390.png') });
    await page.getByRole('button', { name: T.finish, exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 10000 }).catch(() => {});
    check('en: "Get started" opens Home', new URL(page.url()).pathname === '/', page.url());
    check("en: ...with bob's post on it", await shows(page.getByText('Hello from bob')));
    check('en: the server knows the steps are done', Boolean((await me(token)).onboarded_at));
    await ctx.close();

    // Logging in again: straight Home.
    const again = await newPage({ lang: 'en', theme: 'light', width: 390 });
    await logInWithForm(again.page, EN, 'nora78');
    check('en: the next login goes Home', new URL(again.page.url()).pathname === '/', again.page.url());
    await again.ctx.close();
  }

  // AR / dark / 375 px: the steps in Arabic, skipped from the tour.
  {
    const T = AR.onboarding;
    await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'omar78', email: 'omar78@example.com', password: PASSWORD }) });
    const { ctx, page } = await newPage({ lang: 'ar', theme: 'dark', width: 375 });
    await logInWithForm(page, AR, 'omar78');
    check('ar: the first login opens Get started', page.url().endsWith('/get-started'), page.url());
    check('ar: in Arabic', await shows(page.getByRole('heading', { name: T.welcome.replace('{{username}}', 'omar78') })));
    check('ar: html dir rtl', (await page.getAttribute('html', 'dir')) === 'rtl');
    check('ar: no horizontal scroll', await noSideScroll(page));
    await page.waitForTimeout(700); // the card's entrance animation
    await page.screenshot({ path: path.join(SP, 'day78-onboarding-language-ar-dark-375.png') });
    const token = await page.evaluate(() => localStorage.getItem('token'));
    // Through to the tour (card 3 is two cards on, the tour one more), then Skip.
    for (const [clicks, card, title] of [[2, 'people', T.peopleTitle], [1, 'tour', T.tourTitle]]) {
      for (let i = 0; i < clicks; i++) await page.getByRole('button', { name: T.next, exact: true }).click();
      check(`ar: the ${card} card in Arabic`, await shows(page.getByRole('heading', { name: title })));
      check(`ar: no horizontal scroll (${card})`, await noSideScroll(page));
      await page.waitForTimeout(700); // the card's entrance animation
      await page.screenshot({ path: path.join(SP, `day78-onboarding-${card}-ar-dark-375.png`) });
    }
    await page.getByRole('button', { name: T.skipAll, exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 10000 }).catch(() => {});
    check('ar: Skip (on the tour) opens Home', new URL(page.url()).pathname === '/', page.url());
    check('ar: skipping counts as done', Boolean((await me(token)).onboarded_at));
    await ctx.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
