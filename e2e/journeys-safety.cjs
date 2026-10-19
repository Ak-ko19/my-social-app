// Day 66: the safety and account user journeys, only through the UI
// (headless Edge, throwaway stack; uma and vic sign up here with the real
// forms, each in their own browser; the stack's alice is made an admin with
// SQL, the way an operator would -- the app has no screen for that).
//  J11 Report -> removed: uma reports vic's post; alice, an admin, removes
//      it from Admin > Reports; it is gone for uma.
//  J12 Block and unblock: uma blocks vic from his profile; he can't find or
//      open hers; she unblocks him in Settings and he can again.
//  J13 Edit profile in another script, and Arabic: an Arabic bio reads right
//      to left in the English app; the app switches to Arabic (RTL, kept on
//      reload, no sideways scroll) and back to English.
//  J14 Change password: her other device is signed out; the old password
//      fails, the new one works.
//  J15 Delete account: vic deletes his account (password, then his username
//      typed to confirm); he can't log in, and uma can't find him.
const { execSync } = require('child_process');
const { PSQL } = require('./pg.cjs');
const AR = require('../frontend/src/i18n/locales/ar.json');
const { WEB, PASSWORD, createRun, launch, person, signUp, attemptLogIn, logIn, logOut, post, openProfile, follow, until } = require('./journey-kit.cjs');

const run = createRun();
const { check } = run;
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const has = (page, text) => until(async () => (await page.getByText(text).count()) > 0);
const NEW_PASSWORD = 'another-fine-password-456';

// Search -> name: is there a result for them?
async function findsPerson(page, name) {
  await page.goto(`${WEB}/search`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/search people, posts/i).fill(name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  return (await page.getByRole('link', { name: new RegExp(`^${name}\\b`) }).count()) > 0;
}

(async () => {
  const browser = await launch();
  const uma = await person(browser, run, 'uma');
  const vic = await person(browser, run, 'vic');
  const alice = await person(browser, run, 'alice', { theme: 'dark' });
  await signUp(uma);
  await logIn(uma);
  await signUp(vic);
  await logIn(vic);

  // J11: a report, and an admin's decision.
  await post(vic, 'Cheap followers, 1000 for 1 dollar, message me now');
  await follow(uma, 'vic');
  await uma.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const spamCard = uma.locator('article.post-card', { hasText: 'Cheap followers' });
  await spamCard.waitFor({ timeout: 10000 });
  await spamCard.getByRole('button', { name: 'More options' }).click();
  await uma.getByRole('menuitem', { name: 'Report post' }).click();
  const dialog = uma.getByRole('dialog');
  await dialog.getByLabel('Spam', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Submit report' }).click();
  check('J11 uma reports vic\'s post', await until(async () => (await dialog.getByText('Report submitted').count()) > 0));
  await dialog.getByRole('button', { name: 'Done' }).click();
  sql("UPDATE users SET is_admin = true WHERE username = 'alice'");
  await logIn(alice);
  await alice.goto(`${WEB}/admin?section=reports`, { waitUntil: 'networkidle' });
  const report = alice.locator('.admin-report', { hasText: 'Cheap followers' });
  check('J11 the admin sees it in Reports', await until(async () => (await report.count()) > 0));
  await report.getByRole('button', { name: 'Remove post' }).click();
  check('J11 ...removes the post (the report is closed)', await until(async () => (await report.count()) === 0));
  await uma.reload({ waitUntil: 'networkidle' });
  await uma.getByRole('button', { name: "What's on your mind?" }).waitFor(); // Home has loaded
  check('J11 it is gone from uma\'s Home', (await uma.getByText('Cheap followers').count()) === 0);
  await alice.goto(`${WEB}/admin?section=log`, { waitUntil: 'networkidle' });
  // Names sit in Unicode isolates (U+2066..U+2069) inside the sentence.
  const isolates = new RegExp(`[${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}]`, 'g');
  check('J11 ...and the admin log says so', await until(async () => (await alice.locator('.admin-log-sentence').allInnerTexts())
    .some((s) => s.replace(isolates, '') === 'alice removed a post by vic')));

  // J12: block, then unblock.
  await openProfile(uma, 'vic');
  await uma.getByRole('button', { name: 'More options' }).click();
  await uma.getByRole('menuitem', { name: 'Block vic' }).click();
  await uma.getByRole('dialog').getByRole('button', { name: 'Block', exact: true }).click();
  check('J12 uma blocks vic from his profile', await has(uma, "You've blocked vic."));
  check('J12 vic can no longer find her', !(await findsPerson(vic, 'uma')));
  await uma.goto(`${WEB}/settings/blocked-users`, { waitUntil: 'networkidle' });
  await uma.getByRole('button', { name: 'Unblock' }).first().click();
  check('J12 she unblocks him in Settings', await has(uma, "You haven't blocked anyone."));
  check('J12 ...and he can find her again', await findsPerson(vic, 'uma'));

  // J13: an Arabic bio, then the app in Arabic and back.
  await uma.goto(`${WEB}/edit-profile`, { waitUntil: 'networkidle' });
  await uma.getByLabel('Bio').fill('مرحبا، أنا أحب القراءة والسفر');
  await uma.getByRole('button', { name: 'Save Changes' }).click();
  await uma.getByRole('status').waitFor({ timeout: 10000 });
  await openProfile(uma, 'uma');
  const bio = uma.locator('.profile-screen-bio');
  check('J13 her Arabic bio is on her profile, right to left in the English app',
    (await bio.innerText().catch(() => '')) === 'مرحبا، أنا أحب القراءة والسفر' && (await bio.evaluate((el) => getComputedStyle(el).direction)) === 'rtl');
  await uma.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  await uma.locator('label.language-option', { hasText: 'العربية' }).click();
  const dirOf = () => uma.evaluate(() => [document.documentElement.lang, document.documentElement.dir].join('/'));
  check('J13 she switches the app to Arabic: right to left', await until(async () => (await dirOf()) === 'ar/rtl' && (await uma.getByRole('heading', { name: AR.language.title }).count()) > 0));
  await uma.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await uma.reload({ waitUntil: 'networkidle' });
  const noSideways = await uma.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check('J13 ...kept on reload: Home in Arabic, no sideways scroll', (await dirOf()) === 'ar/rtl' && (await uma.getByRole('button', { name: AR.nav.home }).count()) > 0 && noSideways);
  await uma.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  await uma.locator('label.language-option', { hasText: 'English' }).click();
  check('J13 ...and back to English, left to right', await until(async () => (await dirOf()) === 'en/ltr' && (await uma.getByRole('heading', { name: 'Language' }).count()) > 0));

  // J14: a new password; her other device is signed out.
  // Signed out from elsewhere: its last calls are refused (401), as they should be.
  const umaPhone = await person(browser, run, 'uma', { allow: [/status (code|of) 401/] });
  await logIn(umaPhone);
  await uma.goto(`${WEB}/settings/account`, { waitUntil: 'networkidle' });
  await uma.getByLabel('Current password').fill(PASSWORD);
  await uma.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await uma.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await uma.getByRole('button', { name: 'Change Password' }).click();
  check('J14 uma changes her password', await has(uma, 'Password changed. You have been signed out on your other devices.'));
  await umaPhone.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
  check('J14 her phone is signed out', await until(async () => /\/login/.test(umaPhone.url())), umaPhone.url());
  await logOut(uma);
  const oldRefused = await attemptLogIn(uma, PASSWORD, { refusal: true });
  check('J14 the old password no longer works', oldRefused !== null && /401/.test(oldRefused), String(oldRefused));
  await logIn(uma, NEW_PASSWORD);
  check('J14 ...the new one does', !/\/login/.test(uma.url()));

  // J15: vic deletes his account.
  await vic.goto(`${WEB}/settings/account`, { waitUntil: 'networkidle' });
  const danger = vic.locator('section', { has: vic.getByRole('heading', { name: 'Delete Account' }) });
  await danger.getByLabel('Enter your password').fill(PASSWORD);
  await danger.getByRole('button', { name: 'Delete Account' }).click();
  const confirm = vic.getByRole('dialog');
  const forever = confirm.getByRole('button', { name: 'Delete Forever' });
  check('J15 "Delete Forever" waits until he types his username', await forever.isDisabled());
  await confirm.getByLabel('Type vic to confirm').fill('vic');
  await forever.click();
  check('J15 vic deletes his account and is signed out', await until(async () => !/\/settings/.test(vic.url()), 15000), vic.url());
  const goneRefused = await attemptLogIn(vic, PASSWORD, { refusal: true });
  check('J15 he can no longer log in', goneRefused !== null, String(goneRefused));
  check('J15 ...and uma can\'t find him', !(await findsPerson(uma, 'vic')));

  await browser.close();
  run.finish();
})().catch(run.crash);
