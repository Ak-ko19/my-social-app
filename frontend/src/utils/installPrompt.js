// Day 72: installing the app. Chrome, Edge and Android offer it with a
// beforeinstallprompt event, sent once, early -- so main.jsx starts
// listening at once and the event is kept for the Menu's "Install the
// app" button. iPhones and iPads have no such event: there the Menu shows
// how to add the app from Safari's Share menu instead.
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function startInstallListener() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // ours to offer, from the Menu
    deferred = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const canPromptInstall = () => Boolean(deferred);

// Shows the browser's own install dialog; 'accepted', 'dismissed', or
// 'unavailable'. The event can only be used once.
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const event = deferred;
  deferred = null;
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  return choice?.outcome || 'dismissed';
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Already running as the installed app.
export function isStandalone() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
}

// iPhone / iPad (iPadOS reports itself as a Mac, but with touch).
export function isIos() {
  const { userAgent, platform, maxTouchPoints } = window.navigator;
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}
