// B9 DM extras in headless Edge (throwaway stack: conversation 1 between
// alice(1) and bob(2)). Alice drives the UI; bob acts via the API, so every
// cross-user update is a real socket broadcast.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const results = [];
const errors = [];
let expectUploadError = false;
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const bob = (method, url, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
}).then((r) => r.json());
const history = async () => (await (await fetch(`${API}/conversations/1/messages`, { headers: { Authorization: `Bearer ${aliceToken}` } })).json()).messages;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async ({ width = 390, theme = 'light' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th);
    }, [aliceToken, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (expectUploadError && /500|status code 500/.test(m.text())) return;
      errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };
  const bubble = (page, text) => page.locator('.messages-bubble-row', { has: page.locator('.messages-bubble', { hasText: text }) }).last();

  const page = await newPage();
  await page.goto('http://localhost:5173/messages/1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200); // socket connect

  // 1. Bob's message arrives live.
  const q = await bob('POST', '/conversations/1/messages', { content: 'what time tomorrow?' });
  await page.getByText('what time tomorrow?').waitFor({ timeout: 5000 });
  check('bob\'s message arrives live', true);

  // 2. Reply to it.
  await bubble(page, 'what time tomorrow?').getByRole('button', { name: 'Reply to message' }).click();
  const bar = page.locator('.messages-replying-bar');
  check('reply bar names bob and quotes the text', /Replying to bob: what time tomorrow\?/.test(await bar.innerText()));
  check('reply focuses the input', await page.evaluate(() => document.activeElement?.id === 'message-composer-input'));
  await page.locator('#message-composer-input').fill('9am works');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForTimeout(1200);
  const replyBubble = bubble(page, '9am works');
  check('reply bubble shows the quote (bob / original text)', /bob/.test(await replyBubble.locator('.messages-reply-quote').innerText()) && /what time tomorrow\?/.test(await replyBubble.locator('.messages-reply-quote').innerText()));
  check('reply bar clears after sending', (await bar.count()) === 0);
  const replyRow = (await history()).find((m) => m.content === '9am works');
  check('server: reply_to_message_id points at bob\'s message', replyRow && replyRow.reply_to_message_id === q.id);

  // 3. Edit own message inline.
  await replyBubble.getByRole('button', { name: 'Edit message' }).click();
  const editInput = page.locator('.messages-edit-form input');
  await editInput.fill('9:30am works');
  await editInput.press('Enter');
  await page.waitForTimeout(1200);
  const edited = bubble(page, '9:30am works');
  check('edit shows new text + "edited"', (await edited.count()) === 1 && /edited/.test(await edited.innerText()));
  const editedRow = (await history()).find((m) => m.id === replyRow.id);
  check('server: content updated + edited_at set', editedRow.content === '9:30am works' && Boolean(editedRow.edited_at));

  // Escape cancels an edit without saving.
  await edited.getByRole('button', { name: 'Edit message' }).click();
  await page.locator('.messages-edit-form input').fill('discard me');
  await page.locator('.messages-edit-form input').press('Escape');
  check('Escape cancels inline edit', (await page.locator('.messages-edit-form').count()) === 0 && (await page.getByText('discard me').count()) === 0);

  // 4. Bob edits his original -> alice sees it live, in the bubble AND the quote.
  await bob('PUT', `/conversations/1/messages/${q.id}`, { content: 'what time on Friday?' });
  await page.getByText('what time on Friday?').first().waitFor({ timeout: 5000 });
  const quoteNow = await bubble(page, '9:30am works').locator('.messages-reply-quote').innerText();
  check('bob\'s edit arrives live and the quote updates too', /what time on Friday\?/.test(quoteNow), quoteNow.replace(/\n/g, ' / '));

  // 5. Bob deletes his original -> quote shows "Message deleted".
  await fetch(`${API}/conversations/1/messages/${q.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${bobToken}` } });
  await page.waitForTimeout(1200);
  const quoteAfterDelete = await bubble(page, '9:30am works').locator('.messages-reply-quote').innerText();
  check('deleted original -> quote reads "Message deleted"', /Message deleted/.test(quoteAfterDelete));

  // 6. Escape cancels a reply.
  await bubble(page, '9:30am works').getByRole('button', { name: 'Reply to message' }).click();
  await page.locator('#message-composer-input').press('Escape');
  check('Escape cancels the reply bar', (await page.locator('.messages-replying-bar').count()) === 0);

  // 7. Photo: first upload fails (500) -> retry succeeds. Intercepted, since
  // the throwaway backend has no Cloudinary; the response echoes clientTempId
  // like the real server so the optimistic bubble reconciles.
  let failNext = true;
  await page.route('**/conversations/1/messages/image', async (route) => {
    const body = route.request().postDataBuffer().toString('latin1');
    const tempId = (body.match(/name="clientTempId"\r\n\r\n([^\r]+)/) || [])[1];
    if (failNext) {
      failNext = false;
      return route.fulfill({ status: 500, body: 'upload failed' });
    }
    return route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ id: 9999, conversation_id: 1, sender_id: 1, type: 'image', content: null, media_url: 'http://localhost:5173/icon-512.png', status: 'sent', created_at: new Date().toISOString(), edited_at: null, deleted_at: null, client_temp_id: tempId, reply_to: null })
    });
  });
  expectUploadError = true;
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Send a photo' }).click()]);
  await chooser.setFiles(require('path').resolve(__dirname, '../frontend/public/icon-192.png'));
  await page.getByRole('button', { name: /Photo failed to send/ }).waitFor({ timeout: 5000 });
  check('failed photo upload shows a Retry', true);
  await page.getByRole('button', { name: /Photo failed to send/ }).click();
  await page.waitForTimeout(1200);
  expectUploadError = false;
  const imgs = await page.locator('.messages-image').count();
  check('retry sends the photo; exactly one image bubble, no failed leftovers',
    imgs === 1 && (await page.getByRole('button', { name: /Photo failed to send/ }).count()) === 0, `images=${imgs}`);

  // 8. 375 dark layout.
  const small = await newPage({ width: 375, theme: 'dark' });
  await small.goto('http://localhost:5173/messages/1', { waitUntil: 'networkidle' });
  await small.getByText('9:30am works').waitFor();
  check('375px dark: no horizontal scroll', !(await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await small.screenshot({ path: path.join(SP, 'b9-thread-dark-375.png') });

  // 9. Day 70: the inbox comes 20 chats at a time. alice opens 21 more chats
  // (22 with bob's); the oldest is "inbox0".
  const json = { 'Content-Type': 'application/json' };
  for (let i = 0; i < 21; i += 1) {
    const name = `inbox${i}`;
    await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: 'a-fine-password-123' }) });
    const them = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: 'a-fine-password-123' }) })).json();
    const conv = await (await fetch(`${API}/conversations`, { method: 'POST', headers: { ...json, Authorization: `Bearer ${them.token}` }, body: JSON.stringify({ userId: 1 }) })).json();
    await fetch(`${API}/conversations/${conv.id}/messages`, { method: 'POST', headers: { ...json, Authorization: `Bearer ${them.token}` }, body: JSON.stringify({ content: `hello from ${name}` }) });
  }
  const inboxPage = await newPage({ width: 375 });
  await inboxPage.goto('http://localhost:5173/messages', { waitUntil: 'networkidle' });
  // The list is virtualized (only rows near the screen exist): count by the
  // last row's index once scrolled to the bottom.
  const lastIndex = async () => {
    await inboxPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await inboxPage.waitForTimeout(400);
    return inboxPage.evaluate(() => Math.max(...[...document.querySelectorAll('.messages-list-item')].map((li) => Number(li.dataset.index))));
  };
  await inboxPage.getByText('hello from inbox20').waitFor();
  const firstLast = await lastIndex();
  const moreButtons = await inboxPage.getByRole('button', { name: 'Load more' }).count();
  check('inbox: the 20 most recent chats, then "Load more"', firstLast === 19 && moreButtons === 1, `last=${firstLast} buttons=${moreButtons}`);
  await inboxPage.getByRole('button', { name: 'Load more' }).click();
  await inboxPage.getByText('hello from inbox0').waitFor();
  const secondLast = await lastIndex();
  check('inbox: ...the other 2, and the button goes', secondLast === 21 && (await inboxPage.getByRole('button', { name: 'Load more' }).count()) === 0, `last=${secondLast}`);

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
