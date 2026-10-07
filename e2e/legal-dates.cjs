// The legal pages' "last updated" dates, read from the app itself
// (frontend/src/screens/LegalScreen.jsx LAST_UPDATED), and formatted the
// way the app shows them -- so the suites don't need editing each time a
// policy changes. English and Arabic (the app's UI languages).
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'screens', 'LegalScreen.jsx'), 'utf8');

function legalDate(doc) {
  const m = src.match(new RegExp(`${doc}: '(\\d{4}-\\d{2}-\\d{2})'`));
  if (!m) throw new Error(`no LAST_UPDATED date for ${doc} in LegalScreen.jsx`);
  const d = new Date(`${m[1]}T12:00:00`);
  return {
    en: d.toLocaleDateString('en-US', { dateStyle: 'long' }),
    ar: d.toLocaleDateString('ar-u-nu-latn', { dateStyle: 'long' })
  };
}

module.exports = { legalDate };
