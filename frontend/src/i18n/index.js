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

// For toLocaleString()/toLocaleDateString(): Burmese dates in Myanmar mode,
// the browser's own locale otherwise.
export const dateLocale = () => (i18n.language === 'my' ? 'my-MM' : undefined);

export default i18n;
