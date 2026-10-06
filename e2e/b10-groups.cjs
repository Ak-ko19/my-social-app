// B10 group chat in headless Edge (throwaway stack: alice(1) follows bob(2)).
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
const call = (method, url, token, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
});
async function signup(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: 'a-fine-password-123' }) });
  return (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, password: 'a-fine-password-123' }) })).json();
}

(async () => {
  const carol = await signup('carol');
  await call('POST', `/users/${carol.id}/follow`, aliceToken);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async ({ width = 390, theme = 'light' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th);
    }, [aliceToken, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };
  const page = await newPage();

  // 1. Create from the UI.
  await page.goto('http://localhost:5173/messages', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New group/ }).click();
  await page.waitForURL('http://localhost:5173/messages/new-group');
  await page.getByPlaceholder('e.g. Weekend plans').fill('Weekend');
  await page.getByRole('checkbox', { name: 'bob' }).check();
  await page.getByRole('checkbox', { name: 'carol' }).check();
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/messages\/\d+$/);
  const groupId = Number(page.url().split('/').pop());
  await page.getByRole('button', { name: /Group info: Weekend, 3 members/ }).waitFor();
  check('create group from the UI -> chat header shows name + 3 members', true);
  await page.waitForTimeout(800); // socket rooms settle

  // 2. Messages from others show their names (live).
  await call('POST', `/conversations/${groupId}/messages`, bobToken, { content: 'hi team' });
  await page.getByText('hi team').waitFor({ timeout: 5000 });
  const bobBubble = page.locator('.messages-bubble', { hasText: 'hi team' });
  check('bob\'s group message arrives live with his name on the bubble', (await bobBubble.locator('.messages-sender-name').innerText()) === 'bob');
  await page.locator('#message-composer-input').fill('hello!');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForTimeout(800);
  check('own bubble has no sender name', (await page.locator('.messages-bubble', { hasText: 'hello!' }).locator('.messages-sender-name').count()) === 0);

  // 3. Info screen: members + roles, rename.
  await page.getByRole('button', { name: /Group info: Weekend/ }).click();
  await page.waitForURL(new RegExp(`/messages/${groupId}/info$`));
  // Wait for the info screen's own rows (the chat header also says "3 members"
  // while the lazily loaded info screen is still arriving).
  await page.locator('.group-member-row').nth(2).waitFor();
  const rows = await page.locator('.group-member-row').allInnerTexts();
  check('info lists You (Admin), bob, carol', /You\s*Admin/.test(rows[0]) && rows.some((r) => /bob/.test(r)) && rows.some((r) => /carol/.test(r)), JSON.stringify(rows));
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Group name').fill('Weekend trip');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Weekend trip' }).waitFor();
  check('rename shows the new name', true);

  // 4. Remove carol -> she loses access.
  // (Day 33: removing is in each member's Options sheet.)
  await page.getByRole('button', { name: 'Options for carol' }).click();
  await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByText('2 members').waitFor();
  check('removing carol -> 2 members', true);
  check('carol can no longer send (403)', (await call('POST', `/conversations/${groupId}/messages`, carol.token, { content: 'x' })).status === 403);

  // 5. Add her back via the picker; bob shows as already in the group.
  await page.getByRole('button', { name: 'Add people' }).click();
  await page.getByRole('checkbox', { name: 'carol' }).waitFor();
  check('picker marks existing members (bob) as In group', await page.getByRole('checkbox', { name: 'bob' }).isDisabled());
  await page.getByRole('checkbox', { name: 'carol' }).check();
  await page.getByRole('button', { name: /^Add/ }).click();
  await page.getByText('3 members').waitFor();
  check('adding carol back -> 3 members', true);

  // 6. Live update: carol leaves (API) while alice watches the info screen.
  await call('DELETE', `/conversations/${groupId}/members/${carol.id}`, carol.token);
  await page.getByText('2 members').waitFor({ timeout: 5000 });
  check('carol leaving updates the open info screen live (group_updated)', true);

  // 7. Inbox row.
  await page.goto('http://localhost:5173/messages', { waitUntil: 'networkidle' });
  const row = page.locator('.messages-row', { hasText: 'Weekend trip' });
  const rowText = await row.innerText();
  check('inbox row: group name, member count, sender-prefixed preview', /Weekend trip/.test(rowText) && /2 members/.test(rowText) && /You: hello!/.test(rowText), rowText.replace(/\n/g, ' / '));

  // 8. Leave -> gone from inbox; bob becomes admin.
  await row.click();
  await page.getByRole('button', { name: /Group info/ }).click();
  await page.getByRole('button', { name: 'Leave group' }).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.waitForURL('http://localhost:5173/messages');
  await page.waitForTimeout(600);
  check('after leaving, the group is gone from the inbox', (await page.locator('.messages-row', { hasText: 'Weekend trip' }).count()) === 0);
  const bobView = await (await call('GET', `/conversations/${groupId}`, bobToken)).json();
  check('bob (last member) was promoted to admin', bobView.my_role === 'admin' && bobView.members.length === 1);

  // 9. 375 dark: a group chat with sender names.
  const g2 = await (await call('POST', '/conversations/groups', aliceToken, { name: 'Dark mode check', userIds: [2, carol.id] })).json();
  await call('POST', `/conversations/${g2.id}/messages`, bobToken, { content: 'from bob' });
  await call('POST', `/conversations/${g2.id}/messages`, carol.token, { content: 'from carol' });
  const small = await newPage({ width: 375, theme: 'dark' });
  await small.goto(`http://localhost:5173/messages/${g2.id}`, { waitUntil: 'networkidle' });
  await small.getByText('from carol').waitFor();
  check('375px dark: no horizontal scroll', !(await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await small.screenshot({ path: path.join(SP, 'b10-group-dark-375.png') });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
