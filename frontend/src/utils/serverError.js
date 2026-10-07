import i18n from '../i18n';
import { translateServerText } from '../i18n/serverMessages';

// B15: the text to show for a failed API call -- the server's own message
// (translated when an Arabic version is known), or the screen's fallback
// (an i18n key) when the server sent nothing usable.
export function serverErrorText(err, fallbackKey, options) {
  const data = err?.response?.data;
  const text = typeof data === 'string' ? data : data?.message;
  if (!text) return i18n.t(fallbackKey, options);
  return translateServerText(text, i18n.language);
}

// Same, for a successful response that carries a message to show.
export function serverText(text) {
  return translateServerText(text, i18n.language);
}
