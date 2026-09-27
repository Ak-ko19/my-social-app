import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import my from './locales/my.json';

// B15: English / Myanmar. Strings live in locales/*.json, keyed by area
// (common, nav, settings, feed, ...). Missing Myanmar keys fall back to
// English. The choice is a per-device preference kept in localStorage.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'my', label: 'မြန်မာ' }
];
const STORAGE_KEY = 'lang';

function initialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.some((l) => l.code === stored)) return stored;
  } catch {
    // storage blocked -- fall through to the browser language
  }
  return typeof navigator !== 'undefined' && /^my\b/i.test(navigator.language || '') ? 'my' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, my: { translation: my } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false
});

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // not persisted; still applies for this visit
  }
});

// Dates/times in the app's language. Chrome/Edge ship a reduced ICU with
// no Burmese data (toLocaleString('my') silently comes out in English), so
// Myanmar mode falls back to formatting by hand in the same shape full ICU
// uses: "၂၀၂၆ စက်တင်ဘာ ၂၇", "၂၇/၉/၂၀၂၆ ၁၄:၀၅:၀၀", "၁၄:၀၅".
// style: 'datetime' (default) | 'date' | 'long' | 'time' (hh:mm).
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
  time: { hour: '2-digit', minute: '2-digit' }
};

export function formatDate(value, style = 'datetime') {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const my = i18n.language === 'my';
  if (!my || intlHasMyanmar) {
    const locale = my ? 'my' : undefined;
    if (style === 'date') return d.toLocaleDateString(locale);
    if (style === 'long') return d.toLocaleDateString(locale, INTL_OPTIONS.long);
    if (style === 'time') return d.toLocaleTimeString(locale || [], INTL_OPTIONS.time);
    return d.toLocaleString(locale);
  }
  const date = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (style === 'long') return myDigits(`${d.getFullYear()} `) + MY_MONTHS[d.getMonth()] + myDigits(` ${d.getDate()}`);
  if (style === 'date') return myDigits(date);
  if (style === 'time') return myDigits(time);
  return myDigits(`${date} ${time}:${pad(d.getSeconds())}`);
}

export default i18n;
