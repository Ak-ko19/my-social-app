import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import { addServerMessages } from './serverMessages';

// B15: English; B16: Arabic (right-to-left). Owner decision 2026-10-07:
// these are the ONLY UI languages (Myanmar was removed) -- people can still
// write in any language. Strings live in locales/*.json, keyed by area
// (common, nav, settings, feed, ...). Missing keys fall back to English. The
// choice is kept in localStorage (and on the account, Day 16); <html lang>
// and <html dir> follow it.
export const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' }
];
const isOffered = (code) => LANGUAGES.some((l) => l.code === code);
const dirOf = (code) => LANGUAGES.find((l) => l.code === code)?.dir || 'ltr';
const STORAGE_KEY = 'lang';

function initialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isOffered(stored)) return stored;
    // A language that is no longer offered (e.g. a saved Myanmar 'my'):
    // start in the browser's language / English, which setLanguage below
    // saves over it -- and drop a pending logged-out pick of it
    // (utils/languageChoice), so the next login doesn't save the fallback to
    // the account as if the person had chosen it.
    if (stored) localStorage.removeItem('langPending');
  } catch {
    // storage blocked -- fall through to the browser language
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  if (/^ar\b/i.test(browser)) return 'ar';
  return 'en';
}

// C4 audit: only English (the fallback) is bundled. Arabic is a separate
// chunk, fetched when chosen -- every visitor used to download every
// translation file on first load.
// Day 50: with its server messages (serverMessages.ar.js), also a chunk.
const LOADERS = {
  ar: () => Promise.all([import('./locales/ar.json'), import('./serverMessages.ar.js')])
};

async function loadLanguage(code) {
  if (!LOADERS[code] || i18n.hasResourceBundle(code, 'translation')) return;
  const [strings, serverMessages] = await LOADERS[code]();
  addServerMessages(code, serverMessages.default);
  i18n.addResourceBundle(code, 'translation', strings.default, true, true);
}

// Switch language (Settings, landing page): fetch its strings, switch, and
// remember the choice. Only a successful switch is saved, so a failed
// download never overwrites someone's saved language with English. A code
// the app doesn't offer (e.g. an account still saying 'my') means English.
export async function setLanguage(requested) {
  const code = isOffered(requested) ? requested : 'en';
  await loadLanguage(code);
  await i18n.changeLanguage(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // not persisted; still applies for this visit
  }
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  document.documentElement.dir = dirOf(lng);
});

const startLanguage = initialLanguage();
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  partialBundledLanguages: true,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false
});

// main.jsx waits for this before the first render, so a saved Arabic
// choice never flashes English first. If the chunk can't load
// (e.g. offline on first visit), the app just starts in English.
export const i18nReady = setLanguage(startLanguage).catch((err) => {
  console.error(err);
  return i18n.changeLanguage('en');
});

// Dates/times in the app's language. Arabic (B16) uses the browser's own
// Arabic data with Western digits ('ar-u-nu-latn'), matching the counts
// shown elsewhere in the UI.
// style: 'datetime' (default) | 'date' | 'long' | 'time' (hh:mm) |
// 'monthYear' (Day 36: "March 2026", e.g. when someone joined) |
// 'longTime' (Day 12: a long date plus hh:mm) | 'dayMonth' (Day 83:
// "October 25", for a calendar day given as YYYY-MM-DD at noon UTC).
const INTL_OPTIONS = {
  long: { dateStyle: 'long' },
  monthYear: { year: 'numeric', month: 'long' },
  time: { hour: '2-digit', minute: '2-digit' },
  dayMonth: { day: 'numeric', month: 'long', timeZone: 'UTC' }
};

export function formatDate(value, style = 'datetime') {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // Day 12: "October 3, 2026 06:53 PM" -- a date people act on (e.g. when a
  // suspension ends), without the seconds of the default style.
  if (style === 'longTime') return `${formatDate(d, 'long')} ${formatDate(d, 'time')}`;
  const locale = i18n.language === 'ar' ? 'ar-u-nu-latn' : undefined;
  if (style === 'date') return d.toLocaleDateString(locale);
  if (style === 'long') return d.toLocaleDateString(locale, INTL_OPTIONS.long);
  if (style === 'monthYear') return d.toLocaleDateString(locale, INTL_OPTIONS.monthYear);
  if (style === 'dayMonth') return d.toLocaleDateString(locale, INTL_OPTIONS.dayMonth);
  if (style === 'time') return d.toLocaleTimeString(locale || [], INTL_OPTIONS.time);
  return d.toLocaleString(locale);
}

export default i18n;
