// Day 64: shared helpers for the user-journey suites (journeys-*.cjs).
// A journey is walked only through the UI, the way a person would: each
// person gets their own browser context (their own storage, like their own
// phone), signs up and logs in with the real forms, and nothing is seeded
// behind the app's back unless a journey says so.
const { chromium } = require('./node_modules/playwright-core');

const WEB = 'http://localhost:5173';
const PASSWORD = 'a-fine-password-123';

function createRun() {
  const results = [];
  const errors = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  // Prints the results and exits 1 on any FAIL or browser error.
  const finish = () => {
    console.log(results.join('\n'));
    console.log('\nconsole/page errors:', errors.length);
    errors.forEach((e) => console.log('  ' + e));
    process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
  };
  const crash = (e) => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(2);
  };
  return { results, errors, check, finish, crash };
}

const launch = () => chromium.launch({ channel: 'msedge', headless: true });

// A person with their own browser (no account yet). `allow` lists console
// errors that are expected in this journey (e.g. a 404 they cause).
async function person(browser, run, name, { lang = 'en', theme = 'light', width = 390, allow = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  await ctx.addInitScript(([l, th]) => {
    if (!localStorage.getItem('lang')) localStorage.setItem('lang', l);
    if (!localStorage.getItem('theme')) localStorage.setItem('theme', th);
  }, [lang, theme]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => run.errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !allow.some((re) => re.test(m.text()))) run.errors.push(`${name}: ${m.text()}`);
  });
  page.username = name;
  return page;
}

// The sign-up form, then the log-in form it sends you to.
async function signUp(page) {
  const name = page.username;
  await page.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Email').fill(`${name}@example.com`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 });
}

async function logIn(page, password = PASSWORD) {
  if (!/\/login/.test(page.url())) await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  // Sign-up has Email and Password fields too: wait until the log-in form
  // (its "Log in" button) is the one on screen.
  await page.getByRole('button', { name: 'Log in' }).waitFor({ timeout: 15000 });
  await page.getByLabel('Email').fill(`${page.username}@example.com`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  // Home, or back to the page you were sent away from.
  const left = await until(() => Promise.resolve(!/\/login/.test(new URL(page.url()).pathname)), 15000);
  if (!left) {
    const alert = await page.getByRole('alert').allInnerTexts().catch(() => []);
    throw new Error(`${page.username} could not log in: still at ${page.url()} ${JSON.stringify(alert)}`);
  }
}

// Settings -> Log Out.
async function logOut(page) {
  await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Log Out' }).click();
  await page.waitForURL((url) => !/\/settings/.test(url.pathname), { timeout: 15000 });
}

// The composer: Home -> "What's on your mind?" -> write -> Post.
async function post(page, text, { audience = null } = {}) {
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: "What's on your mind?" }).click();
  await page.getByRole('textbox', { name: 'Post' }).fill(text);
  if (audience) await page.getByRole('radio', { name: audience }).check();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.waitForURL((url) => !/create-post/.test(url.pathname), { timeout: 15000 });
}

// Search -> the person's name -> their profile.
async function openProfile(page, name) {
  await page.goto(`${WEB}/search`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/search people, posts/i).fill(name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(`^${name}\\b`) }).first().click();
  await page.waitForURL(/\/profile\/\d+/, { timeout: 15000 });
}

const until = (fn, ms = 10000) => (async () => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
})();

module.exports = { WEB, PASSWORD, createRun, launch, person, signUp, logIn, logOut, post, openProfile, until };
