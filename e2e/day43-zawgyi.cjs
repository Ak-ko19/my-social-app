// Day 43 steps 1-2: Zawgyi Myanmar text is stored and shown as Unicode
// (headless Edge, throwaway stack: alice(1), bob(2), conversation 1).
// Alice types Zawgyi into the post composer, a comment, a comment edit, a
// chat message, a message edit and her bio; every screen then shows the
// Unicode text (rendered with Noto Sans Myanmar), and bob sees the same.
// Text fields stop at the server's limits; a Zawgyi search finds it and is
// remembered in Unicode. Myanmar + dark, Arabic (RTL).
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

// "Hello Maung Maung, how are you" typed with a Zawgyi font, and in Unicode.
const ZAWGYI = 'ေမာင္ေမာင္ ေနေကာင္းလား';
const UNICODE = 'မောင်မောင် နေကောင်းလား';
// "Yangon" / "Mingalaba".
const Z_YANGON = 'ရန္ကုန္';
const U_YANGON = 'ရန်ကုန်';
const Z_HELLO = 'မဂၤလာပါ';
const U_HELLO = 'မင်္ဂလာပါ';

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

  // 1. A post typed in Zawgyi shows as Unicode.
  const alice = await open('alice', '/');
  await alice.locator('.post-composer-trigger').click();
  const composer = alice.locator('textarea').first();
  check('post composer stops at 10,000 characters', (await composer.getAttribute('maxlength')) === '10000');
  await composer.fill(`${ZAWGYI}\n${Z_YANGON}`);
  await alice.locator('form button[type="submit"]').click();
  const card = alice.locator('article.post-card').first();
  await card.waitFor({ timeout: 10000 });
  await alice.waitForTimeout(400);
  const cardText = await card.innerText();
  check('the new post shows the Unicode text', cardText.includes(UNICODE) && cardText.includes(U_YANGON) && !cardText.includes(ZAWGYI), cardText.slice(0, 80));
  const font = await card.getByText(UNICODE).first().evaluate((el) => getComputedStyle(el).fontFamily);
  check('Burmese is set in a font list with Noto Sans Myanmar', /Noto Sans Myanmar/.test(font), font);

  // 2. Comment, then edit the comment, both in Zawgyi.
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  const commentInput = alice.locator('input[id^="comment-input-"]');
  check('comment box stops at 5,000 characters', (await commentInput.getAttribute('maxlength')) === '5000');
  await commentInput.fill(Z_HELLO);
  await commentInput.press('Enter');
  const commentList = alice.locator('[aria-label="Comments"]').first();
  await commentList.getByText(U_HELLO).waitFor({ timeout: 8000 }).catch(() => {});
  check('the comment shows as Unicode', (await commentList.getByText(U_HELLO).count()) === 1 && !(await commentList.innerText()).includes(Z_HELLO));
  await commentList.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const editComment = alice.locator('input[id^="edit-comment-"]');
  check('comment edit box stops at 5,000 characters', (await editComment.getAttribute('maxlength')) === '5000');
  await editComment.fill(`${Z_HELLO} ${Z_YANGON}`);
  await commentList.getByRole('button', { name: 'Save', exact: true }).click();
  await commentList.getByText(`${U_HELLO} ${U_YANGON}`).waitFor({ timeout: 8000 }).catch(() => {});
  check('the edited comment settles on the Unicode text', (await commentList.getByText(`${U_HELLO} ${U_YANGON}`).count()) === 1 && !(await commentList.innerText()).includes(Z_YANGON));
  await alice.context().close();

  // 3. A chat message and its edit.
  const chat = await open('alice', '/messages/1');
  const bubble = (text) => chat.locator('.messages-bubble-row', { has: chat.locator('.messages-bubble', { hasText: text }) }).last();
  const box = chat.locator('#message-composer-input');
  check('message box stops at 5,000 characters', (await box.getAttribute('maxlength')) === '5000');
  await box.fill(ZAWGYI);
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await bubble(UNICODE).waitFor({ timeout: 8000 }).catch(() => {});
  check('the sent message shows as Unicode', (await bubble(UNICODE).count()) === 1 && (await chat.locator('.messages-bubble', { hasText: ZAWGYI }).count()) === 0);
  await bubble(UNICODE).getByRole('button', { name: 'Edit message' }).click();
  const editInput = chat.locator('.messages-edit-form input');
  check('message edit box stops at 5,000 characters', (await editInput.getAttribute('maxlength')) === '5000');
  await editInput.fill(`${ZAWGYI} ${Z_YANGON}`);
  await editInput.press('Enter');
  await bubble(U_YANGON).waitFor({ timeout: 8000 }).catch(() => {});
  check('the edited message settles on the Unicode text', (await bubble(U_YANGON).count()) === 1 && (await chat.locator('.messages-bubble', { hasText: Z_YANGON }).count()) === 0);
  await chat.context().close();

  // 4. Bio.
  const profile = await open('alice', '/edit-profile');
  const bioBox = profile.locator('textarea').first();
  check('bio field stops at 500 characters', (await bioBox.getAttribute('maxlength')) === '500');
  await bioBox.fill(ZAWGYI);
  await profile.getByRole('button', { name: 'Save changes' }).click();
  await profile.waitForFunction((u) => document.querySelector('textarea').value === u, UNICODE, { timeout: 8000 }).catch(() => {});
  check('the bio field shows the saved Unicode text', (await bioBox.inputValue()) === UNICODE, await bioBox.inputValue());
  await profile.context().close();
  const me = await (await fetch(`${API}/profile/me`, { headers: { Authorization: `Bearer ${tokens.alice}` } })).json();
  check('stored as Unicode (bio)', me.bio === UNICODE);

  // 5. Bob, in Myanmar + dark and Arabic (RTL), sees Unicode everywhere.
  for (const [theme, lang, width] of [['dark', 'my', 375], ['light', 'ar', 430]]) {
    const p = await open('bob', '/profile/1', { theme, lang, width });
    await p.getByText(UNICODE).first().waitFor({ timeout: 10000 }).catch(() => {});
    const body = await p.locator('main, body').first().innerText();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}/${lang} ${width}px: bob sees the post and bio in Unicode, no sideways scroll`,
      body.includes(UNICODE) && body.includes(U_YANGON) && !body.includes(ZAWGYI) && !overflow);
    if (lang === 'ar') check('Arabic page is right-to-left', (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
    await p.screenshot({ path: path.join(SP, `day43-zawgyi-${theme}-${lang}-${width}.png`) });
    await p.context().close();
  }

  // 6. Search (step 2): a Zawgyi query finds the post, and the recent
  // search is kept in Unicode.
  const finder = await open('bob', '/search');
  await finder.getByRole('searchbox', { name: 'Search people, posts or hashtags' }).fill(Z_YANGON);
  await finder.getByRole('button', { name: 'Search', exact: true }).click();
  await finder.locator('#search-panel').waitFor();
  await finder.waitForFunction(() => !document.querySelector('#search-panel [role="status"]'));
  await finder.waitForTimeout(200);
  const found = await finder.locator('.search-post-link').allInnerTexts();
  check('a Zawgyi search finds the post (shown in Unicode)', found.length === 1 && found[0].includes(U_YANGON), JSON.stringify(found));
  await finder.goto(`${WEB}/search`, { waitUntil: 'networkidle' });
  await finder.locator('.recent-searches-query').first().waitFor({ timeout: 10000 }).catch(() => {});
  const recent = await finder.locator('.recent-searches-query').allInnerTexts();
  check('the recent search shows in Unicode', JSON.stringify(recent) === JSON.stringify([U_YANGON]), JSON.stringify(recent));
  await finder.context().close();

  // 7. Over the limit (e.g. an old app version): the server refuses.
  const over = await fetch(`${API}/posts`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'x'.repeat(10001) })
  });
  check('a post over 10,000 characters is refused (400)', over.status === 400 && (await over.text()) === 'Post must be 10000 characters or fewer');

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
