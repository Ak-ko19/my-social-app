// Day 16: the app languages (frontend/src/i18n LANGUAGES). users.language
// has a CHECK constraint with the same list (migration 033).
const APP_LANGUAGES = ['en', 'my', 'ar'];

const isAppLanguage = (value) => APP_LANGUAGES.includes(value);

module.exports = { APP_LANGUAGES, isAppLanguage };
