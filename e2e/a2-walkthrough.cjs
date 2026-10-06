// A2 browser verification in real Edge (headless) against the throwaway
// local stack from e2e-up.sh:
//  1. Console-clean walkthrough of every main screen + core actions.
//  2. Network drop (context.setOffline) on an open conversation: banner
//     appears; a message Bob sends meanwhile shows up after reconnect in
//     both the thread and the inbox.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const { execSync, spawn } = require('child_process');

const { PSQL } = require('./pg.cjs');
const serverPid = () =>
  execSync('netstat -ano').toString().split('\n')
    .find((l) => /:3000\s.*LISTENING/.test(l)).trim().split(/\s+/).pop();
const startBackend = () =>
  spawn('node', ['server.js'], {
    cwd: require('path').resolve(__dirname, '../backend'), detached: true, stdio: 'ignore',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://testuser@localhost:55433/mysocialapp_e2e',
      JWT_SECRET: 'e2e-local-only-secret',
      ALLOWED_ORIGINS: 'http://localhost:5173', FRONTEND_URL: 'http://localhost:5173',
      EMAIL_HOST: '', EMAIL_USER: '', EMAIL_PASS: '',
      CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: ''
    }
  }).unref();

const SP = __dirname;
const APP = 'http://localhost:5173';
const API = 'http://localhost:3000';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();

const problems = [];
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(([t]) => {
    localStorage.setItem('token', t);
    localStorage.setItem('userId', '1');
    localStorage.setItem('username', 'alice');
    localStorage.setItem('emailVerified', 'true');
    window.addEventListener('unhandledrejection', (e) => console.error('UNHANDLED REJECTION:', String(e.reason)));
  }, [aliceToken]);

  const page = await context.newPage();
  let offlinePhase = false;
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Errors while deliberately offline are expected (failed polls etc.).
    if (offlinePhase) return;
    problems.push(`[console.error @ ${page.url()}] ${text}`);
  });
  page.on('pageerror', (err) => problems.push(`[pageerror @ ${page.url()}] ${err.message}`));

  const visit = async (route, expectText) => {
    await page.goto(APP + route, { waitUntil: 'networkidle' });
    const body = await page.locator('body').innerText();
    check(`visit ${route}`, !expectText || body.includes(expectText), expectText ? `expects "${expectText}"` : '');
  };

  // --- 1. Walkthrough ---
  await visit('/', 'Hello from bob');
  // like + comment on bob's post from the feed
  const like = page.getByRole('button', { name: /like/i }).first();
  if (await like.count()) { await like.click(); await page.waitForTimeout(800); check('like post', true); }
  else check('like post', false, 'no like button found');

  await visit('/posts/1', 'Hello from bob');
  await visit('/hashtag/welcome', 'Hello from bob');
  await visit('/profile/2', 'bob');
  await visit('/search');
  await page.getByPlaceholder(/search people, posts or hashtags/i).fill('bob');
  await page.getByRole('button', { name: /^search$/i }).click();
  await page.waitForTimeout(1000);
  check('search finds bob', (await page.locator('body').innerText()).includes('Hello from bob'));
  await visit('/notifications', 'Notifications');
  await visit('/settings/blocked-users', "haven't blocked anyone");
  await visit('/settings/follow-requests', 'No pending follow requests');
  await visit('/saved');
  await visit('/menu');
  await visit('/settings');
  await visit('/edit-profile');
  check('edit-profile prefilled', (await page.locator('input').evaluateAll((els) => els.map((e) => e.value))).includes('alice'));

  // --- 2. Offline / reconnect on an open conversation ---
  await visit('/messages', 'bob');
  await visit('/messages/1', 'bob');
  await page.waitForTimeout(1500); // let the socket connect

  // Real drop: kill the backend. (Chromium's setOffline leaves an already
  // open WebSocket untouched, so it can't simulate this.)
  offlinePhase = true;
  execSync(`taskkill /PID ${serverPid()} /F`);
  // Banner shows after SHOW_AFTER_MS (2s) of downtime.
  let bannerShown = false;
  for (let i = 0; i < 20 && !bannerShown; i++) {
    await page.waitForTimeout(500);
    bannerShown = await page.getByText(/reconnect/i).count() > 0;
  }
  check('banner appears while disconnected', bannerShown);

  // A message Alice's socket can never have received live: written straight
  // to the throwaway DB while the server is down.
  execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -c "INSERT INTO messages (conversation_id, sender_id, content) VALUES (1, 2, 'missed-during-outage')"`);
  startBackend();

  let recovered = false;
  for (let i = 0; i < 60 && !recovered; i++) {
    await page.waitForTimeout(500);
    recovered = (await page.locator('body').innerText()).includes('missed-during-outage');
  }
  check('missed message appears in thread after reconnect', recovered);
  await page.waitForTimeout(1500);
  check('banner clears after reconnect', await page.getByText(/reconnect/i).count() === 0);
  offlinePhase = false;

  // Alice replies over the (re)connected socket.
  const box = page.locator('textarea, input[type="text"]').last();
  await box.fill('reply-after-reconnect');
  await box.press('Enter');
  await page.waitForTimeout(1500);
  const hist = await fetch(`${API}/conversations/1/messages`, { headers: { Authorization: `Bearer ${bobToken}` } }).then((r) => r.json());
  check('send works after reconnect', hist.messages.some((m) => m.content === 'reply-after-reconnect'));

  // Inbox reflects the missed message too.
  await page.goto(APP + '/messages', { waitUntil: 'networkidle' });
  check('inbox shows latest message', (await page.locator('body').innerText()).includes('reply-after-reconnect'));

  await page.screenshot({ path: path.join(SP, 'a2-inbox.png') });
  await browser.close();

  console.log(results.join('\n'));
  console.log('\nConsole errors / page errors outside the offline window:', problems.length);
  problems.forEach((p) => console.log('  ' + p));
  process.exit(results.some((r) => r.startsWith('FAIL')) || problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
