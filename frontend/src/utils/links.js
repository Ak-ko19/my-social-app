import { safeHttpUrl } from './safeUrl';

// Day 19: web links inside user text (posts, comments, messages).
// A link runs to the next whitespace or quote/angle bracket; punctuation
// that usually ends the sentence rather than the link ("see https://x.com.")
// is left out, and so is a closing bracket that has no opening one in the
// link ("(https://x.com)").
export const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

export function trimLink(raw) {
  let url = raw.replace(/[.,!?;:'"…]+$/u, '');
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
    while (url.endsWith(close) && url.split(open).length < url.split(close).length) {
      url = url.slice(0, -1).replace(/[.,!?;:'"…]+$/u, '');
    }
  }
  return url;
}

// The first safe http(s) link in `text`, or null.
export function firstLink(text) {
  if (typeof text !== 'string') return null;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = safeHttpUrl(trimLink(match[0]));
    if (url) return url;
  }
  return null;
}

// "www.example.com/a" -> "example.com".
export function displayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
