// B4 comment replies + likes in headless Edge against the throwaway stack
// (e2e-up.sh: alice(1) follows bob(2); bob has post 1).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const api = (method, url, token, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
}).then((r) => r.json());

(async () => {
  const bobTop = await api('POST', '/posts/1/comments', bobToken, { content: 'bob-top' });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async (token, userId, username, { width = 390, theme = 'light' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, id, name, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', id);
      localStorage.setItem('username', name); localStorage.setItem('emailVerified', 'true');
      localStorage.setItem('theme', th);
    }, [token, String(userId), username, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };

  const page = await newPage(aliceToken, 1, 'alice');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Comment', exact: true }).first().click();
  await page.getByText('bob-top').waitFor();
  check('comments open and show bob\'s comment with Reply + Like', (await page.getByRole('button', { name: 'Reply to bob' }).count()) === 1);

  // Like bob's comment.
  await page.getByRole('button', { name: /^Like bob's comment/ }).click();
  await page.waitForTimeout(700);
  const likeBtn = page.getByRole('button', { name: /bob's comment/ }).first();
  check('like: pressed with count 1', (await likeBtn.getAttribute('aria-pressed')) === 'true' && /1 like/.test(await likeBtn.getAttribute('aria-label')), await likeBtn.getAttribute('aria-label'));
  const serverAfterLike = (await api('GET', '/posts/1/comments', aliceToken)).comments.find((c) => c.id === bobTop.id);
  check('server: liked_by_me + like_count 1', serverAfterLike.liked_by_me === true && serverAfterLike.like_count === 1);

  // Reply to bob.
  const input = page.locator('input[id^="comment-input-"]');
  await page.getByRole('button', { name: 'Reply to bob' }).click();
  check('reply banner + @mention prefill + input focused',
    (await page.getByText('Replying to').count()) === 1 && (await input.inputValue()) === '@bob ' &&
    await page.evaluate(() => document.activeElement?.id?.startsWith('comment-input-')));
  await input.pressSequentially('thanks');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.waitForTimeout(900);
  const repliesText = await page.locator('.comment-replies').first().innerText().catch(() => '');
  check('reply renders nested under bob\'s comment', /@bob thanks/.test(repliesText), repliesText.slice(0, 60));
  check('reply banner clears after sending', (await page.getByText('Replying to').count()) === 0);

  // Reply to the reply -> same thread (flattened).
  await page.getByRole('button', { name: 'Reply to alice' }).click();
  check('replying to a reply prefills @alice', (await input.inputValue()) === '@alice ');
  await input.pressSequentially('more');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.waitForTimeout(900);
  check('reply-to-reply lands in the same thread (2 replies)', (await page.locator('.comment-replies > li').count()) === 2);
  const server = (await api('GET', '/posts/1/comments', aliceToken)).comments;
  const replies = server.filter((c) => c.parent_comment_id === bobTop.id);
  check('server: both replies point at the top-level comment', replies.length === 2, JSON.stringify(server.map((c) => [c.content, c.parent_comment_id])));

  // Cancel via x and via Escape.
  await page.getByRole('button', { name: 'Reply to bob' }).click();
  await page.getByRole('button', { name: 'Cancel reply' }).click();
  check('x cancels reply and removes the prefill', (await page.getByText('Replying to').count()) === 0 && (await input.inputValue()) === '');
  await page.getByRole('button', { name: 'Reply to bob' }).click();
  await input.press('Escape');
  check('Escape cancels reply', (await page.getByText('Replying to').count()) === 0 && (await input.inputValue()) === '');

  // Unlike.
  await page.getByRole('button', { name: /^Unlike bob's comment/ }).click();
  await page.waitForTimeout(700);
  check('unlike clears the like', (await api('GET', '/posts/1/comments', aliceToken)).comments.find((c) => c.id === bobTop.id).like_count === 0);

  // Bob's notifications: reply + comment_like.
  const bobNotes = (await api('GET', '/notifications', bobToken)).notifications.map((n) => n.type);
  check('bob notified: reply + comment_like, and no duplicate mention for the @bob reply', bobNotes.includes('reply') && bobNotes.includes('comment_like') && !bobNotes.includes('mention'), JSON.stringify(bobNotes));
  const bobPage = await newPage(bobToken, 2, 'bob');
  await bobPage.goto('http://localhost:5173/notifications', { waitUntil: 'networkidle' });
  const notesText = await bobPage.locator('body').innerText();
  check('Notifications screen reads "replied to your comment" / "liked your comment"', /replied to your comment/.test(notesText) && /liked your comment/.test(notesText));

  // 375px dark: threads fit, no page h-scroll.
  const small = await newPage(aliceToken, 1, 'alice', { width: 375, theme: 'dark' });
  await small.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await small.getByRole('button', { name: 'Comment', exact: true }).first().click();
  await small.getByText('bob-top').waitFor();
  await small.waitForTimeout(400);
  const hScroll = await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('375px dark: no horizontal scroll with threads open', !hScroll);
  await small.locator('.feed-comment-section').screenshot({ path: path.join(SP, 'b4-thread-dark-375.png') });

  // Day 70: comments come a page at a time; "View more comments" brings the
  // rest. Days 109-110: 20 threads a page, Most relevant first (with no
  // reactions or replies yet that is the newest first).
  const busy = await api('POST', '/posts', bobToken, { content: 'A busy post' });
  for (let i = 1; i <= 55; i += 1) await api('POST', `/posts/${busy.id}/comments`, bobToken, { content: `note ${i}` });
  const AR = require('../frontend/src/i18n/locales/ar.json');
  for (const [lang, more] of [['en', 'View more comments'], ['ar', AR.comments.viewMore]]) {
    const reader = await newPage(aliceToken, 1, 'alice', { width: 375 });
    await reader.addInitScript((l) => localStorage.setItem('lang', l), lang);
    await reader.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    const card = reader.locator('article.post-card', { hasText: 'A busy post' });
    // Day 85: the card says how many before they are opened...
    const count = lang === 'en' ? '55 comments' : AR.feed.commentCount_many.replace('{{count}}', '55');
    const stats = () => card.locator('.post-card-stats').innerText();
    await card.waitFor();
    check(`${lang}: the card says "${count}" before they are opened`, (await stats()).includes(count), await stats());
    await card.locator('.feed-action-btn, button').filter({ hasText: lang === 'en' ? /^Comment$/ : AR.feed.comment }).first().click();
    await reader.getByText('note 55', { exact: true }).waitFor();
    const shown = () => reader.locator('.feed-comment-list > li').count();
    check(`${lang}: the first 20, newest first, then "${more}"`, (await shown()) === 20
      && (await reader.getByText('note 36', { exact: true }).count()) === 1 && (await reader.getByText('note 35', { exact: true }).count()) === 0
      && (await reader.getByRole('button', { name: more }).count()) === 1);
    // ...and still all of them (not the 20 loaded so far) once open.
    check(`${lang}: ...still "${count}" with 20 loaded`, (await stats()).includes(count), await stats());
    await reader.getByRole('button', { name: more }).click();
    await reader.getByText('note 16', { exact: true }).waitFor();
    await reader.getByRole('button', { name: more }).click();
    await reader.getByText('note 1', { exact: true }).waitFor();
    check(`${lang}: ...which brings the rest, 20 at a time, and goes away`, (await shown()) === 55 && (await reader.getByRole('button', { name: more }).count()) === 0);
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
