// Day 64: the core user journeys, only through the UI (headless Edge,
// throwaway stack; nora, omar and pia sign up here with the real forms,
// each in their own browser).
//  J1 New here: the landing page -> sign up -> log in -> a first post, on
//     Home and on their profile.
//  J2 Log out and back in; a reload keeps you in (and out).
//  J3 Find someone and follow them: search -> profile -> Follow; their
//     post is on your Home; like and comment; they're notified.
//  J4 A private account: a follow request, approved in Settings, and only
//     then the posts.
//  J5 Messages: from a profile, live both ways.
const { WEB, createRun, launch, person, signUp, logIn, logOut, post, openProfile, until } = require('./journey-kit.cjs');

const run = createRun();
const { check } = run;

(async () => {
  const browser = await launch();
  const nora = await person(browser, run, 'nora');
  const omar = await person(browser, run, 'omar');
  // pia opens nora's private profile before she may: its lists answer 403
  // (expected; the screen says the account is private).
  const pia = await person(browser, run, 'pia', { allow: [/status of 403/] });

  // J1: from the landing page to a first post.
  await nora.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  await nora.getByRole('link', { name: /Create your free account/ }).first().click();
  await nora.waitForURL(/\/signup/);
  check('J1 the landing page leads to sign-up', true);
  await signUp(nora);
  check('J1 signing up sends you to log in', /\/login/.test(nora.url()));
  await logIn(nora);
  check('J1 logging in opens Home', nora.url() === `${WEB}/`);
  await post(nora, 'Hello, I am new here #firstpost');
  const onHome = await until(async () => (await nora.getByText('Hello, I am new here').count()) > 0);
  check('J1 the first post is on Home', onHome);
  await nora.getByRole('button', { name: 'Profile' }).click();
  await nora.getByRole('button', { name: /@nora/ }).click();
  check('J1 ...and on their own profile', await until(async () => (await nora.getByText('Hello, I am new here').count()) > 0));

  // J2: log out, log back in; reloads keep each state.
  await logOut(nora);
  await nora.reload({ waitUntil: 'networkidle' });
  await nora.goto(`${WEB}/messages`, { waitUntil: 'networkidle' });
  check('J2 logged out: an account page sends you to log in', /\/login/.test(nora.url()), nora.url());
  await logIn(nora);
  check('J2 logging in takes you back to where you were going (Messages)', /\/messages$/.test(nora.url()), nora.url());
  await nora.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await nora.reload({ waitUntil: 'networkidle' });
  check('J2 a reload keeps you logged in', nora.url() === `${WEB}/` && (await until(async () => (await nora.getByText('Hello, I am new here').count()) > 0)));

  // J3: omar finds nora, follows her, likes and comments; she's told.
  await signUp(omar);
  await logIn(omar);
  await openProfile(omar, 'nora');
  await omar.getByRole('button', { name: 'Follow', exact: true }).click();
  check('J3 follow from her profile: the button says Following', await until(async () => (await omar.getByRole('button', { name: 'Following', exact: true }).count()) > 0));
  await omar.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const card = omar.locator('article.post-card', { hasText: 'Hello, I am new here' });
  check('J3 her post is now on his Home', await until(async () => (await card.count()) > 0));
  await card.getByRole('button', { name: /^Like/ }).click();
  check('J3 he likes it', await until(async () => (await card.getByRole('button', { name: /^Like/ }).getAttribute('aria-pressed')) === 'true'));
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await omar.getByRole('textbox', { name: 'Write a comment' }).fill('Welcome, nora!');
  await omar.getByRole('button', { name: 'Send', exact: true }).click();
  check('J3 ...and comments', await until(async () => (await omar.getByText('Welcome, nora!').count()) > 0));
  await nora.getByRole('button', { name: 'Notifications' }).click();
  await nora.waitForURL(/\/notifications/);
  const told = await until(async () => {
    const text = await nora.locator('main, .screen-enter').first().innerText();
    return /omar started following you/.test(text) && /omar liked your post/.test(text) && /omar commented on your post/.test(text);
  });
  check('J3 nora is notified: follow, like, comment', told);

  // J4: nora goes private; pia has to ask first.
  await nora.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  const privateSwitch = nora.getByRole('switch', { name: /account (private|public)/i });
  await privateSwitch.click();
  check('J4 nora makes her account private', await until(async () => (await privateSwitch.getAttribute('aria-checked')) === 'true'));
  await signUp(pia);
  await logIn(pia);
  await openProfile(pia, 'nora');
  check('J4 pia can\'t see her posts yet', (await pia.getByText('Hello, I am new here').count()) === 0);
  await pia.getByRole('button', { name: 'Follow', exact: true }).click();
  check('J4 her Follow becomes a request', await until(async () => (await pia.getByRole('button', { name: 'Requested', exact: true }).count()) > 0));
  await nora.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await nora.getByRole('button', { name: 'Follow Requests' }).click();
  await nora.getByRole('button', { name: 'Approve' }).first().click();
  check('J4 nora approves it in Settings', await until(async () => (await nora.getByRole('button', { name: 'Approve' }).count()) === 0));
  await pia.reload({ waitUntil: 'networkidle' });
  check('J4 ...and pia sees her posts', await until(async () => (await pia.getByText('Hello, I am new here').count()) > 0));

  // J5: omar messages nora from her profile; both see it live.
  await nora.goto(`${WEB}/messages`, { waitUntil: 'networkidle' });
  await openProfile(omar, 'nora');
  await omar.getByRole('button', { name: 'Message', exact: true }).click();
  await omar.waitForURL(/\/messages\/\d+/, { timeout: 15000 });
  await omar.getByRole('textbox', { name: 'Write a message' }).fill('Hi nora, coffee later?');
  await omar.getByRole('button', { name: 'Send', exact: true }).click();
  check('J5 nora\'s inbox shows it without a reload', await until(async () => (await nora.getByText('Hi nora, coffee later?').count()) > 0));
  await nora.getByText('Hi nora, coffee later?').first().click();
  await nora.waitForURL(/\/messages\/\d+/, { timeout: 15000 });
  await nora.getByRole('textbox', { name: 'Write a message' }).fill('Sure, at 5!');
  await nora.getByRole('button', { name: 'Send', exact: true }).click();
  check('J5 omar sees her reply without a reload', await until(async () => (await omar.getByText('Sure, at 5!').count()) > 0));

  await browser.close();
  run.finish();
})().catch(run.crash);
