// Day 16: the app languages (frontend/src/i18n LANGUAGES). users.language
// has a CHECK constraint with the same list (migrations 033, 051).
// Owner decision 2026-10-07: English and Arabic only -- this is the app's
// own text; people can still write posts, comments and messages in any
// language.
const APP_LANGUAGES = ['en', 'ar'];

const isAppLanguage = (value) => APP_LANGUAGES.includes(value);

module.exports = { APP_LANGUAGES, isAppLanguage };
