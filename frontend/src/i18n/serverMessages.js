// B15: the API answers errors with plain English text (e.g. "Incorrect
// password"), which screens show as-is in English. In Arabic, known messages
// are swapped for a translation (serverMessages.ar.js); anything not listed
// is shown in English rather than replaced by a vaguer generic message.
// The Arabic table is loaded with the Arabic strings (i18n/index.js calls
// addServerMessages), so English visitors never download it.

// Every controller's 500 fallback reads "<Action> failed. Please try again later."
const FAILED = / failed\. Please try again later\.$/;
const TABLES = {};

// { exact: { english: translation }, failed: generic translation }
export function addServerMessages(language, table) {
  TABLES[language] = table;
}

export function translateServerText(text, language) {
  const table = TABLES[language];
  if (!table || typeof text !== 'string') return text;
  if (table.exact[text]) return table.exact[text];
  return FAILED.test(text) ? table.failed : text;
}
