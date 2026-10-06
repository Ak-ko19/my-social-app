// The legal pages' "last updated" dates, read from the app itself
// (frontend/src/screens/LegalScreen.jsx LAST_UPDATED), and formatted the
// way the app shows them -- so the suites don't need editing each time a
// policy changes.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'screens', 'LegalScreen.jsx'), 'utf8');
const MY_DIGITS = '၀၁၂၃၄၅၆၇၈၉';
const MY_MONTHS = ['ဇန်နဝါရီ', 'ဖေဖော်ဝါရီ', 'မတ်', 'ဧပြီ', 'မေ', 'ဇွန်', 'ဇူလိုင်', 'ဩဂုတ်', 'စက်တင်ဘာ', 'အောက်တိုဘာ', 'နိုဝင်ဘာ', 'ဒီဇင်ဘာ'];

function legalDate(doc) {
  const m = src.match(new RegExp(`${doc}: '(\\d{4}-\\d{2}-\\d{2})'`));
  if (!m) throw new Error(`no LAST_UPDATED date for ${doc} in LegalScreen.jsx`);
  const d = new Date(`${m[1]}T12:00:00`);
  const my = (s) => String(s).replace(/\d/g, (x) => MY_DIGITS[x]);
  return {
    en: d.toLocaleDateString('en-US', { dateStyle: 'long' }),
    ar: d.toLocaleDateString('ar-u-nu-latn', { dateStyle: 'long' }),
    my: `${my(d.getFullYear())} ${MY_MONTHS[d.getMonth()]} ${my(d.getDate())}`
  };
}

module.exports = { legalDate };
