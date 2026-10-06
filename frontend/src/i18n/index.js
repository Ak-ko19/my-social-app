import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

// B15: English / Myanmar; B16: Arabic (right-to-left). Strings live in
// locales/*.json, keyed by area (common, nav, settings, feed, ...). Missing
// keys fall back to English. The choice is a per-device preference kept in
// localStorage; <html lang> and <html dir> follow it.
export const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'my', label: 'မြန်မာ', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' }
];
const dirOf = (code) => LANGUAGES.find((l) => l.code === code)?.dir || 'ltr';
const STORAGE_KEY = 'lang';

function initialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.some((l) => l.code === stored)) return stored;
  } catch {
    // storage blocked -- fall through to the browser language
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  if (/^my\b/i.test(browser)) return 'my';
  if (/^ar\b/i.test(browser)) return 'ar';
  return 'en';
}

// C4 audit: only English (the fallback) is bundled. Other languages are
// separate chunks, fetched when chosen -- every visitor used to download all
// three translation files on first load.
const LOADERS = {
  my: () => import('./locales/my.json'),
  ar: () => import('./locales/ar.json')
};

async function loadLanguage(code) {
  if (!LOADERS[code] || i18n.hasResourceBundle(code, 'translation')) return;
  const mod = await LOADERS[code]();
  i18n.addResourceBundle(code, 'translation', mod.default, true, true);
}

// Switch language (Settings, landing page): fetch its strings, switch, and
// remember the choice. Only a successful switch is saved, so a failed
// download never overwrites someone's saved language with English.
export async function setLanguage(code) {
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

// main.jsx waits for this before the first render, so a saved Myanmar or
// Arabic choice never flashes English first. If the chunk can't load
// (e.g. offline on first visit), the app just starts in English.
export const i18nReady = setLanguage(startLanguage).catch((err) => {
  console.error(err);
  return i18n.changeLanguage('en');
});

// Dates/times in the app's language. Chrome/Edge ship a reduced ICU with
// no Burmese data (toLocaleString('my') silently comes out in English), so
// Myanmar mode falls back to formatting by hand in the same shape full ICU
// uses: "၂၀၂၆ စက်တင်ဘာ ၂၇", "၂၇/၉/၂၀၂၆ ၁၄:၀၅:၀၀", "၁၄:၀၅".
// Arabic (B16) uses the browser's own Arabic data with Western digits
// ('ar-u-nu-latn'), matching the counts shown elsewhere in the UI.
// style: 'datetime' (default) | 'date' | 'long' | 'time' (hh:mm) |
// 'monthYear' (Day 36: "March 2026", e.g. when someone joined).
const MY_DIGITS = '၀၁၂၃၄၅၆၇၈၉';
const MY_MONTHS = ['ဇန်နဝါရီ', 'ဖေဖော်ဝါရီ', 'မတ်', 'ဧပြီ', 'မေ', 'ဇွန်', 'ဇူလိုင်', 'ဩဂုတ်', 'စက်တင်ဘာ', 'အောက်တိုဘာ', 'နိုဝင်ဘာ', 'ဒီဇင်ဘာ'];
const myDigits = (s) => String(s).replace(/\d/g, (d) => MY_DIGITS[d]);
const pad = (n) => String(n).padStart(2, '0');
let intlHasMyanmar = false;
try {
  intlHasMyanmar = Intl.DateTimeFormat.supportedLocalesOf(['my']).length > 0;
} catch {
  // very old browser -- use the fallback
}
const INTL_OPTIONS = {
  datetime: undefined,
  date: undefined,
  long: { dateStyle: 'long' },
  monthYear: { year: 'numeric', month: 'long' },
  time: { hour: '2-digit', minute: '2-digit' }
};

export function formatDate(value, style = 'datetime') {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // Day 12: "October 3, 2026 06:53 PM" -- a date people act on (e.g. when a
  // suspension ends), without the seconds of the default style.
  if (style === 'longTime') return `${formatDate(d, 'long')} ${formatDate(d, 'time')}`;
  const my = i18n.language === 'my';
  if (!my || intlHasMyanmar) {
    const locale = my ? 'my' : i18n.language === 'ar' ? 'ar-u-nu-latn' : undefined;
    if (style === 'date') return d.toLocaleDateString(locale);
    if (style === 'long') return d.toLocaleDateString(locale, INTL_OPTIONS.long);
    if (style === 'monthYear') return d.toLocaleDateString(locale, INTL_OPTIONS.monthYear);
    if (style === 'time') return d.toLocaleTimeString(locale || [], INTL_OPTIONS.time);
    return d.toLocaleString(locale);
  }
  const date = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (style === 'long') return myDigits(`${d.getFullYear()} `) + MY_MONTHS[d.getMonth()] + myDigits(` ${d.getDate()}`);
  if (style === 'monthYear') return myDigits(`${d.getFullYear()} `) + MY_MONTHS[d.getMonth()];
  if (style === 'date') return myDigits(date);
  if (style === 'time') return myDigits(time);
  return myDigits(`${date} ${time}:${pad(d.getSeconds())}`);
}

export default i18n;
