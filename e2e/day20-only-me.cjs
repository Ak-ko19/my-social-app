// Day 20: "only me" posts. Throwaway stack: alice(1) follows bob(2).
// Bob writes an "only me" post in the composer; alice (a follower) must not
// see it anywhere; bob changes it to public from the post menu and then she
// can. EN, AR (RTL).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const get = (url, token) => fetch(API + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function newPage(token, id, name, { lang = 'en', theme = 'light', width = 390 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, i, n, l, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', i); localStorage.setItem('username', n);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', l); localStorage.setItem('theme', th);
    }, [token, String(id), name, lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text()) && !/AxiosError/.test(m.text())) errors.push(`${name}/${lang}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${name}/${lang}: ${e.message}`));
    return page;
  }
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const EN = locale('en');

  // 1. Bob writes an "only me" note in the composer.
  const bob = await newPage(bobToken, 2, 'bob');
  await bob.goto(`${WEB}/create-post`, { waitUntil: 'networkidle' });
  await bob.locator('textarea').fill('note to self: buy milk #private');
  await bob.getByRole('radio', { name: EN.compose.onlyMe }).check();
  await bob.getByRole('button', { name: /^post$/i }).click();
  await bob.waitForURL(`${WEB}/`, { timeout: 8000 }).catch(() => {});
  const mine = (await (await get('/users/2/posts', bobToken)).json()).posts.find((p) => p.content.startsWith('note to self'));
  check('composer: stored as only_me', mine?.visibility === 'only_me', mine?.visibility);
  await bob.goto(`${WEB}/posts/${mine.id}`, { waitUntil: 'networkidle' });
  const audience = bob.locator('.post-card-audience').first();
  check('bob sees his note, marked "Only me" with a lock', (await audience.getAttribute('title')) === EN.feed.audienceOnlyMe && (await audience.locator('svg.lucide-lock').count()) === 1);

  // 2. Alice follows bob but sees nothing of it.
  const alice = await newPage(aliceToken, 1, 'alice');
  await alice.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  check('alice (a follower): not on Home', (await alice.getByText('note to self').count()) === 0);
  await alice.goto(`${WEB}/profile/2`, { waitUntil: 'networkidle' });
  check('alice: not on bob\'s profile', (await alice.getByText('note to self').count()) === 0);
  await alice.goto(`${WEB}/posts/${mine.id}`, { waitUntil: 'networkidle' });
  check('alice: the direct link says the post is not found', /Post not found/.test(await alice.locator('body').innerText()));
  check('API: not in hashtag, search, or for anonymous', !JSON.stringify(await (await get('/hashtags/private/posts', aliceToken)).json()).includes('note to self')
    && !JSON.stringify(await (await get('/search/posts?q=milk', aliceToken)).json()).includes('note to self')
    && (await get(`/posts/${mine.id}`)).status === 404);

  // 3. Bob makes it public from the post menu: the menu offers the other two.
  await bob.goto(`${WEB}/posts/${mine.id}`, { waitUntil: 'networkidle' });
  await bob.getByRole('button', { name: EN.postMenu.moreOptions }).first().click();
  const menu = bob.getByRole('dialog');
  check('menu offers "public" and "followers only", not the current audience',
    (await menu.getByText(EN.postMenu.makePublic).count()) === 1 && (await menu.getByText(EN.postMenu.makeFollowersOnly).count()) === 1 && (await menu.getByText(EN.postMenu.makeOnlyMe).count()) === 0);
  await menu.getByText(EN.postMenu.makePublic).click();
  await bob.waitForTimeout(800);
  check('changed to public', (await (await get(`/posts/${mine.id}`)).json()).visibility === 'public');
  await alice.goto(`${WEB}/posts/${mine.id}`, { waitUntil: 'networkidle' });
  check('...and now alice can see it', (await alice.getByText('note to self').count()) >= 1);
  await bob.context().close();
  await alice.context().close();

  // 4. Arabic (RTL), and English at 375px dark: the composer option, translated, fits.
  for (const [lang, theme, width] of [['en', 'dark', 375], ['ar', 'dark', 430]]) {
    const L = locale(lang);
    const page = await newPage(bobToken, 2, 'bob', { lang, theme, width });
    await page.goto(`${WEB}/create-post`, { waitUntil: 'networkidle' });
    check(`${lang}: "${L.compose.onlyMe}" option in the composer`, (await page.getByRole('radio', { name: L.compose.onlyMe }).count()) === 1);
    check(`${lang}: no horizontal scroll`, await noHScroll(page));
    await page.screenshot({ path: path.join(SP, `day20-compose-${lang}-${theme}-${width}.png`) });
    await page.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
