// Day 44: poll posts (headless Edge, throwaway stack: alice(1), bob(2)).
// Alice builds a poll in the composer (3 options, 3 days) -- an empty or
// repeated option is explained first, and photos and a poll exclude each
// other. Her new post shows the (empty) results to her. Bob, in dark
// mode at 375px, sees the options (no counts), votes, and gets the results
// with his vote ticked. Arabic (RTL): the bars fill from the right. An
// ended poll shows "Final results" to everyone. axe on the poll in both
// states; no sideways scroll at 375px.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };

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
    page.on('console', (m) => {
      // The 400 the composer test provokes on purpose is not an error.
      if (m.type() === 'error' && !/status of 400/.test(m.text())) errors.push(`${who}: ${m.text()}`);
    });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const axe = async (page, label) => {
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document.querySelector('.poll'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }));
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious in the poll`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };
  const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // 1. Alice builds a poll in the composer.
  const alice = await open('alice', '/create-post');
  await alice.getByRole('textbox', { name: 'Post' }).fill('Tea or coffee this morning?');
  await alice.getByRole('button', { name: 'Add a poll' }).click();
  check('the poll replaces the photo picker', (await alice.locator('input[type=file]').count()) === 0);
  await alice.getByRole('textbox', { name: 'Option 1' }).fill('Tea');
  await alice.getByRole('textbox', { name: 'Option 2' }).fill('tea');
  await alice.getByRole('button', { name: 'Post', exact: true }).click();
  check('a repeated option is explained first', (await alice.getByRole('alert').innerText()) === 'Each option must be different.');
  await alice.getByRole('textbox', { name: 'Option 2' }).fill('Coffee');
  await alice.getByRole('button', { name: 'Add option' }).click();
  await alice.getByRole('textbox', { name: 'Option 3' }).fill('Neither');
  await alice.getByRole('combobox', { name: 'Poll length' }).selectOption({ label: '3 days' });
  await alice.getByRole('button', { name: 'Post', exact: true }).click();
  await alice.waitForURL(`${WEB}/`, { timeout: 10000 }).catch(() => {});
  const card = alice.locator('article.post-card').first();
  await card.locator('.poll').waitFor({ timeout: 10000 }).catch(() => {});
  const ownResults = await card.locator('.poll-result').allInnerTexts();
  check('her new post shows the results to her (0% each)', ownResults.length === 3 && ownResults.every((r) => r.includes('0%')), JSON.stringify(ownResults));
  check('...with "0 votes · 3 days left"', (await card.locator('.poll-footer').innerText()) === '0 votes · 3 days left', await card.locator('.poll-footer').innerText());
  const postId = Number(sql("SELECT post_id FROM polls ORDER BY post_id DESC LIMIT 1"));
  await alice.context().close();

  // Photos and a poll exclude each other.
  const photos = await open('alice', '/create-post');
  await photos.locator('input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
  // Day 57: a picked photo shows once it's been prepared (shrunk).
  await photos.locator('.image-picker-item').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('with a photo picked, "Add a poll" is off and says why',
    await photos.getByRole('button', { name: 'Add a poll' }).isDisabled() && (await photos.getByText("A poll can't have photos").count()) === 1);
  await photos.context().close();

  // 2. Bob, dark, 375px: options first, then his vote.
  const bob = await open('bob', `/posts/${postId}`, { theme: 'dark', width: 375 });
  const poll = bob.locator('.poll');
  await poll.waitFor({ timeout: 10000 }).catch(() => {});
  check('dark: before voting, the options and no counts',
    JSON.stringify(await poll.getByRole('button').allInnerTexts()) === '["Tea","Coffee","Neither"]' && (await poll.getByText('%').count()) === 0);
  await axe(bob, 'dark, before voting');
  await poll.getByRole('button', { name: 'Coffee' }).click();
  await poll.locator('.poll-result').first().waitFor({ timeout: 8000 }).catch(() => {});
  const mine = poll.locator('.poll-result.is-mine');
  check('dark: his vote shows the results, Coffee 100% and ticked',
    (await mine.innerText()).includes('Coffee') && (await mine.innerText()).includes('100%') && (await mine.getByLabel('Your vote').count()) === 1);
  check('dark: the footer counts 1 vote', (await poll.locator('.poll-footer').innerText()).startsWith('1 vote ·'), await poll.locator('.poll-footer').innerText());
  check('dark: no sideways scroll at 375px', await noSideScroll(bob));
  await axe(bob, 'dark, results');
  await bob.screenshot({ path: path.join(SP, 'day44-poll-dark-375.png') });
  // Reloading keeps it, and the vote counted once.
  await bob.reload({ waitUntil: 'networkidle' });
  await bob.locator('.poll-result.is-mine').waitFor({ timeout: 8000 }).catch(() => {});
  check('after a reload: still his vote, 1 vote in all', (await bob.locator('.poll-result.is-mine').count()) === 1 && sql(`SELECT COUNT(*) FROM poll_votes WHERE post_id = ${postId}`) === '1');
  await bob.context().close();

  // 3. Arabic: the bars fill from the right. Alice votes Tea: 50% / 50%.
  const teaId = sql(`SELECT id FROM poll_options WHERE post_id = ${postId} AND label = 'Tea'`);
  await fetch(`http://localhost:3000/posts/${postId}/poll/vote`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ optionId: Number(teaId) })
  });
  const ar = await open('alice', `/posts/${postId}`, { lang: 'ar', width: 430 });
  await ar.locator('.poll-result').first().waitFor({ timeout: 10000 }).catch(() => {});
  const coffee = ar.locator('.poll-result', { hasText: 'Coffee' });
  const [row, bar] = [await coffee.boundingBox(), await coffee.locator('.poll-result-bar').boundingBox()];
  check('ar: the page is right-to-left', (await ar.evaluate(() => document.documentElement.dir)) === 'rtl');
  check('ar: a 50% bar is half the row, against its right edge',
    row && bar && Math.abs(bar.x + bar.width - (row.x + row.width)) < 2 && Math.abs(bar.width - row.width / 2) < 2, JSON.stringify({ row, bar }));
  const neither = await ar.locator('.poll-result', { hasText: 'Neither' }).locator('.poll-result-bar').boundingBox();
  check('ar: an option with no votes has no bar', neither && neither.width < 1);
  await ar.screenshot({ path: path.join(SP, 'day44-poll-ar-430.png') });
  await ar.context().close();

  // 4. Ended: final results for everyone, no more votes.
  sql(`UPDATE polls SET closes_at = now() - interval '1 minute' WHERE post_id = ${postId}`);
  const ended = await open('alice', `/posts/${postId}`, { theme: 'dark' });
  await ended.locator('.poll-footer').waitFor({ timeout: 10000 }).catch(() => {});
  check('an ended poll says "Final results"', (await ended.locator('.poll-footer').innerText()) === '2 votes · Final results');
  await ended.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
