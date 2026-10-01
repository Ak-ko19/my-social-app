import i18n, { setLanguage } from '../i18n';
import { saveLanguage } from '../services/profileService';

// Day 16: the app language follows the ACCOUNT across devices -- but only
// languages the person actually picked are saved there, never a device's
// default:
// - picked while logged in  -> saved to the account at once;
// - picked while logged out (landing page, Language screen) -> remembered
//   on this device as pending, and saved to the account at the next login
//   there (a fresh, deliberate choice wins over the account's);
// - otherwise, logging in applies the account's language, if it has one.
const PENDING_KEY = 'langPending';

function readPending() {
  try {
    return localStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

function writePending(on) {
  try {
    if (on) localStorage.setItem(PENDING_KEY, '1');
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // storage blocked: the choice still applies on this device
  }
}

// The person picked `code`. Rejects only if it couldn't be saved to the
// account (the app has switched anyway).
export async function chooseLanguage(code, token) {
  await setLanguage(code).catch(() => {});
  if (!token) {
    writePending(true);
    return;
  }
  writePending(false);
  await saveLanguage(code, token);
}

// For signup: the language to keep on the new account -- only if one was
// picked on this device, else undefined (the account stays "not chosen").
export function pickedLanguage() {
  return readPending() ? i18n.language : undefined;
}

// Right after a login: settle device vs account (see the rules above).
export async function syncLanguageAtLogin(accountLanguage, token) {
  const current = i18n.language;
  if (readPending()) {
    writePending(false);
    if (accountLanguage !== current) await saveLanguage(current, token).catch(() => {});
    return;
  }
  if (accountLanguage && accountLanguage !== current) {
    await setLanguage(accountLanguage).catch(() => {});
  }
}
