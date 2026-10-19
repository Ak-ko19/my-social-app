// Day 64: the social user journeys, only through the UI (headless Edge,
// throwaway stack with real photo uploads -- E2E_MEDIA=1, see
// cloudinary-stub.cjs; rana, sami and tariq sign up here with the real
// forms, each in their own browser).
//  J6 A group chat: rana starts one with sami and tariq; it is live for
//     everyone, with names on the bubbles.
//  J7 A photo post: sami picks a photo, it is really uploaded, and rana
//     (who follows him) sees it on Home.
//  J8 A story: sami adds one; it is in rana's tray, she opens it, and it
//     turns seen.
//  J9 A group: tariq creates one, sami finds it, joins and posts; tariq
//     sees the post.
//  J10 A page and an event: rana follows tariq's page and its post is on
//     her Home; sami says Going to rana's event and she sees him counted.
const path = require('path');
const { WEB, createRun, launch, person, signUp, logIn, post, follow, loaded, until } = require('./journey-kit.cjs');

const run = createRun();
const { check } = run;
const PHOTO = path.join(__dirname, '../frontend/public/icon-512.png');
const has = (page, text) => until(async () => (await page.getByText(text).count()) > 0);

(async () => {
  const browser = await launch();
  const rana = await person(browser, run, 'rana');
  const sami = await person(browser, run, 'sami', { theme: 'dark' });
  const tariq = await person(browser, run, 'tariq');
  for (const p of [rana, sami, tariq]) {
    await signUp(p);
    await logIn(p);
  }
  await follow(rana, 'sami');
  await follow(rana, 'tariq');

  // J6: a group chat, live for all three.
  await sami.goto(`${WEB}/messages`, { waitUntil: 'networkidle' });
  await tariq.goto(`${WEB}/messages`, { waitUntil: 'networkidle' });
  await rana.goto(`${WEB}/messages`, { waitUntil: 'networkidle' });
  await rana.getByRole('button', { name: /New group/ }).click();
  await rana.getByLabel('Group name').fill('Weekend plans');
  await rana.getByRole('checkbox', { name: 'sami' }).check();
  await rana.getByRole('checkbox', { name: 'tariq' }).check();
  await rana.getByRole('button', { name: 'Create group' }).click();
  await rana.waitForURL(/\/messages\/\d+$/, { timeout: 15000 });
  check('J6 rana creates the group: 3 members', await until(async () => (await rana.getByRole('button', { name: /Group info: Weekend plans, 3 members/ }).count()) > 0));
  await rana.getByRole('textbox', { name: 'Write a message' }).fill('Picnic on Saturday?');
  await rana.getByRole('button', { name: 'Send', exact: true }).click();
  check('J6 it reaches sami\'s and tariq\'s inboxes without a reload', (await has(sami, 'Picnic on Saturday?')) && (await has(tariq, 'Picnic on Saturday?')));
  await sami.locator('.messages-row', { hasText: 'Weekend plans' }).click();
  await sami.waitForURL(/\/messages\/\d+$/, { timeout: 15000 });
  await tariq.locator('.messages-row', { hasText: 'Weekend plans' }).click();
  await tariq.waitForURL(/\/messages\/\d+$/, { timeout: 15000 });
  await sami.getByRole('textbox', { name: 'Write a message' }).fill('I am in!');
  await sami.getByRole('button', { name: 'Send', exact: true }).click();
  const samiBubble = (page) => page.locator('.messages-bubble', { hasText: 'I am in!' });
  check('J6 sami\'s reply is live for rana and tariq, under his name', await until(async () => {
    for (const p of [rana, tariq]) {
      if ((await samiBubble(p).count()) === 0 || (await samiBubble(p).locator('.messages-sender-name').innerText()) !== 'sami') return false;
    }
    return true;
  }));

  // J7: a photo post, really uploaded.
  await sami.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await sami.getByRole('button', { name: "What's on your mind?" }).click();
  await sami.getByRole('textbox', { name: 'Post' }).fill('Sunset from the roof');
  await sami.getByLabel('Choose photos').setInputFiles(PHOTO);
  await sami.locator('.image-picker-item').first().waitFor({ timeout: 10000 }); // shrunk first (Day 57)
  await sami.getByRole('button', { name: 'Post', exact: true }).click();
  await sami.waitForURL((url) => !/create-post/.test(url.pathname), { timeout: 20000 }).catch(async () => {
    throw new Error(`sami could not post the photo: ${JSON.stringify(await sami.getByRole('alert').allInnerTexts())}`);
  });
  await rana.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const photoCard = rana.locator('article.post-card', { hasText: 'Sunset from the roof' });
  check('J7 sami\'s photo post is on rana\'s Home', await until(async () => (await photoCard.count()) > 0));
  const photo = photoCard.locator('.post-card-media img').first();
  check('J7 ...and the photo itself loads (the uploaded file)', await until(() => loaded(photo)), await photo.getAttribute('src').catch(() => 'no img'));

  // J8: a story, seen by a follower.
  await sami.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const [chooser] = await Promise.all([
    sami.waitForEvent('filechooser'),
    sami.getByRole('button', { name: 'Add to your story' }).first().click()
  ]);
  await chooser.setFiles(PHOTO);
  await sami.getByRole('menuitem', { name: 'Your story' }).click();
  check('J8 sami adds a story', await until(async () => (await sami.getByRole('button', { name: 'View your story' }).count()) > 0, 20000));
  await rana.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const newRing = rana.getByRole('button', { name: "View sami's story (new)" });
  check('J8 it is in rana\'s tray, marked new', await until(async () => (await newRing.count()) > 0));
  await newRing.click();
  const viewer = rana.getByRole('dialog', { name: "sami's story" });
  await viewer.waitFor();
  check('J8 she opens it and the photo loads', await until(() => loaded(viewer.locator('.story-viewer-image'))));
  await rana.keyboard.press('Escape');
  check('J8 ...and now it shows as seen', await until(async () => (await rana.getByRole('button', { name: "View sami's story", exact: true }).count()) > 0));

  // J9: a group, joined by someone who found it.
  await tariq.goto(`${WEB}/groups`, { waitUntil: 'networkidle' });
  await tariq.getByRole('button', { name: /Create/ }).click();
  await tariq.getByLabel('Name').fill('Night Runners');
  await tariq.getByRole('button', { name: 'Create group' }).click();
  await tariq.waitForURL(/\/groups\/\d+$/, { timeout: 15000 });
  const groupUrl = tariq.url();
  check('J9 tariq creates a group', await until(async () => (await tariq.getByRole('heading', { name: 'Night Runners' }).count()) > 0));
  await sami.goto(`${WEB}/groups`, { waitUntil: 'networkidle' });
  await sami.getByRole('link', { name: /Night Runners/ }).click();
  await sami.getByRole('button', { name: 'Join group' }).click();
  check('J9 sami finds it under Discover and joins', await until(async () => (await sami.getByRole('button', { name: 'Write a post' }).count()) > 0));
  await sami.getByRole('button', { name: 'Write a post' }).click();
  await sami.getByRole('textbox', { name: 'Post' }).fill('Run at 9 tonight, who is coming?');
  await sami.getByRole('button', { name: 'Post', exact: true }).click();
  await sami.waitForURL(groupUrl, { timeout: 15000 });
  await tariq.reload({ waitUntil: 'networkidle' });
  check('J9 tariq sees sami\'s post in the group', await has(tariq, 'Run at 9 tonight, who is coming?'));

  // J10: a page's post reaches a follower; an event gets a Going.
  await tariq.goto(`${WEB}/pages`, { waitUntil: 'networkidle' });
  await tariq.getByRole('button', { name: /Create/ }).click();
  await tariq.getByLabel('Page name').fill('Corner Bakery');
  await tariq.getByLabel('Category').selectOption('business');
  await tariq.getByRole('button', { name: 'Create page' }).click();
  await tariq.waitForURL(/\/pages\/\d+$/, { timeout: 15000 });
  const pageUrl = tariq.url();
  await tariq.getByRole('button', { name: 'Post as page' }).click();
  await tariq.getByRole('textbox', { name: 'Post' }).fill('Fresh bread every morning at 7');
  await tariq.getByRole('button', { name: 'Post', exact: true }).click();
  await tariq.waitForURL(pageUrl, { timeout: 15000 });
  check('J10 tariq creates a page and posts as it', await has(tariq, 'Fresh bread every morning at 7'));
  await rana.goto(`${WEB}/pages`, { waitUntil: 'networkidle' });
  await rana.getByRole('button', { name: 'Follow Corner Bakery' }).click();
  await rana.getByRole('heading', { name: 'Following' }).waitFor({ timeout: 10000 });
  await rana.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const pageCard = rana.locator('article.post-card', { hasText: 'Fresh bread every morning at 7' });
  check('J10 rana follows the page; its post is on her Home, by the page', await until(async () => (await pageCard.getByRole('link', { name: 'Corner Bakery' }).count()) > 0));

  await rana.goto(`${WEB}/events`, { waitUntil: 'networkidle' });
  await rana.getByRole('button', { name: /Create/ }).click();
  await rana.getByLabel('Event name').fill('Park picnic');
  await rana.getByLabel('Location (optional)').fill('Central park');
  await rana.getByRole('button', { name: 'Create event' }).click();
  await rana.getByRole('heading', { name: 'Park picnic', level: 2 }).waitFor({ timeout: 15000 });
  const eventUrl = rana.url();
  check('J10 rana creates an event', /\/events\/\d+$/.test(eventUrl), eventUrl);
  await sami.goto(`${WEB}/events?tab=discover`, { waitUntil: 'networkidle' });
  await sami.getByRole('link', { name: /Park picnic/ }).click();
  await sami.getByRole('button', { name: 'Going', exact: true }).click();
  check('J10 sami finds it and says Going', await until(async () => (await sami.getByRole('button', { name: 'Going', exact: true, pressed: true }).count()) > 0));
  await rana.reload({ waitUntil: 'networkidle' });
  check('J10 ...and rana sees him counted', (await has(rana, /1 going/)) && (await rana.getByRole('link', { name: 'sami' }).count()) > 0);

  await browser.close();
  run.finish();
})().catch(run.crash);
