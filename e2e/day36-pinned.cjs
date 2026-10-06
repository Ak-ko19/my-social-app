// Day 36 step 3: pinned post (headless Edge, throwaway stack: alice(1),
// bob(2)). Alice pins her oldest post from its menu on her profile; it
// moves to the top, labelled "Pinned", and appears once -- for her and for
// bob; the home feed has no "Pinned" label; unpinning puts it back in
// place. Dark and Arabic (RTL).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };

(async () => {
  const post = (content) => {
    const form = new FormData();
    form.append('content', content);
    return fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}` }, body: form }).then((r) => r.json());
  };
  await post('First trip to Bagan');
  await new Promise((r) => setTimeout(r, 30));
  await post('Second: tea in Yangon');
  await new Promise((r) => setTimeout(r, 30));
  await post('Third: rainy season');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  const cards = (page) => page.locator('.profile-tab-posts .post-card');
  const firstText = async (page) => (await cards(page).first().innerText());

  // 1. Pin the oldest post from its menu.
  const alice = await open('alice', '/profile/1');
  await cards(alice).nth(2).waitFor({ timeout: 10000 });
  check('before pinning: newest first', (await firstText(alice)).includes('Third: rainy season'));
  const oldest = cards(alice).filter({ hasText: 'First trip to Bagan' });
  await oldest.getByRole('button', { name: 'More options' }).click();
  await alice.getByRole('menuitem', { name: 'Pin to profile' }).click();
  await alice.locator('.post-card-pinned').waitFor({ timeout: 8000 }).catch(() => {});
  check('it moves to the top, labelled "Pinned"', (await firstText(alice)).includes('First trip to Bagan') && (await cards(alice).first().locator('.post-card-pinned').count()) === 1);
  check('...and appears once', (await cards(alice).filter({ hasText: 'First trip to Bagan' }).count()) === 1 && (await cards(alice).count()) === 3);

  // 2. Bob sees it pinned too; the home feed has no "Pinned" label.
  const bob = await open('bob', '/profile/1');
  await cards(bob).first().waitFor({ timeout: 10000 });
  check('bob sees it pinned on top', (await firstText(bob)).includes('First trip to Bagan') && (await cards(bob).first().getByText('Pinned').count()) === 1);
  const feed = await open('alice', '/');
  await feed.getByText('Third: rainy season').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('the home feed shows no "Pinned" label', (await feed.locator('.post-card-pinned').count()) === 0);
  await feed.context().close();

  // 3. Its menu now says Unpin; unpinning restores the order.
  await cards(alice).first().getByRole('button', { name: 'More options' }).click();
  await alice.getByRole('menuitem', { name: 'Unpin from profile' }).click();
  await alice.waitForTimeout(800);
  check('after unpinning: back to newest first, no label', (await firstText(alice)).includes('Third: rainy season') && (await alice.locator('.post-card-pinned').count()) === 0);
  check('a post that isn\'t pinned offers "Pin to profile"', await (async () => {
    await cards(alice).first().getByRole('button', { name: 'More options' }).click();
    const ok = (await alice.getByRole('menuitem', { name: 'Pin to profile' }).count()) === 1;
    await alice.keyboard.press('Escape');
    return ok;
  })());
  check('bob\'s menu on alice\'s post has no pin option', await (async () => {
    await bob.reload({ waitUntil: 'networkidle' });
    await cards(bob).first().getByRole('button', { name: 'More options' }).click();
    const none = (await bob.getByRole('menuitem', { name: /Pin to profile|Unpin/ }).count()) === 0;
    await bob.keyboard.press('Escape');
    return none;
  })());

  // 4. Dark and Arabic, pinned.
  await fetch(`${API}/profile/pinned-post`, {
    method: 'PUT', headers: { Authorization: `Bearer ${tokens.alice}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId: (await (await fetch(`${API}/users/1/posts?tab=posts`)).json()).posts.at(-1).id })
  });
  for (const [theme, lang, label] of [['dark', 'en', 'Pinned'], ['light', 'ar', 'مثبّت']]) {
    const p = await open('bob', '/profile/1', { theme, lang });
    await p.locator('.post-card-pinned').waitFor({ timeout: 10000 }).catch(() => {});
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}/${lang}: the pinned label shows, no sideways scroll`, (await p.locator('.post-card-pinned').innerText()).includes(label) && !overflow);
    if (lang === 'ar') check('Arabic page is right-to-left', (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
    await p.screenshot({ path: path.join(SP, `day36-pinned-${theme}-${lang}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
