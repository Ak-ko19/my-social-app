// Day 49: the one Hidden words matcher, for posts and comments. A viewer's
// own filter (Instagram's Hidden words): it never stops anyone writing.
//
// Both the text and each hidden word are folded the same way, then matched
// as whole words or whole phrases -- "class" never matches "ass". Folding:
// NFKC and lower case; Arabic diacritics and tatweel dropped, alef / yeh /
// teh marbuta / hamza-carrier forms made one; @ and $ inside a word read as
// a / s and digits inside a word as letters (a$$, sh1t). Each word in the
// text is also tried with stretched letters squeezed (fuuuck, شرموووطة) and
// without an Arabic و / ف / ال in front. Scripts written without spaces
// between words (Chinese, Japanese, Thai, Burmese, Khmer, Lao) can't be
// split into words, so a hidden word in one of them matches anywhere.

const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const ARABIC_LETTERS = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه' };
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
const IS_LETTER = /\p{L}/u;
const SPLIT = /[^\p{L}\p{M}\p{N}]+/u;
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Myanmar}\p{Script=Khmer}\p{Script=Lao}]/u;
const ARABIC_PREFIXES = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف'];

// Letters only: one spelling per letter.
function foldLetters(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱىئؤة]/g, (ch) => ARABIC_LETTERS[ch]);
}

// Inside a word only: @ or $ after a letter (a$$), a digit between letters
// (sh1t). So "@bob" (a mention), "$5", "b4" and "covid19" stay as they are.
function readLeet(text) {
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1] || '';
    const afterLetter = IS_LETTER.test([...out].pop() || '');
    const isDigit = /\d/.test(ch);
    out += LEET[ch] && afterLetter && (!isDigit || IS_LETTER.test(next)) ? LEET[ch] : ch;
  }
  return out;
}

export function fold(text) {
  return readLeet(foldLetters(text));
}

const words = (folded) => folded.split(SPLIT).filter(Boolean);
const squeeze = (word, keep) => word.replace(/(.)\1{2,}/gu, keep === 2 ? '$1$1' : '$1');

// Every way a word in the text may be spelled.
function variants(word) {
  const out = new Set([word, squeeze(word, 2), squeeze(word, 1), word.replace(/(.)\1+/gu, '$1')]);
  for (const form of [...out]) {
    const prefix = ARABIC_PREFIXES.find((p) => form.startsWith(p) && [...form].length - [...p].length >= 2);
    if (prefix) out.add(form.slice(prefix.length));
  }
  return out;
}

// buildMatcher(list) -> (text) => true when the text contains any of them.
export function buildMatcher(list) {
  const phrases = [];
  const anywhere = [];
  for (const item of list || []) {
    const folded = fold(item);
    if (NO_SPACE_SCRIPT.test(folded)) {
      const joined = folded.replace(/\s+/g, '');
      if (joined) anywhere.push(joined);
      continue;
    }
    const parts = words(folded);
    if (parts.length) phrases.push(parts);
  }
  const byFirst = new Map();
  for (const p of phrases) {
    if (!byFirst.has(p[0])) byFirst.set(p[0], []);
    byFirst.get(p[0]).push(p);
  }
  if (byFirst.size === 0 && anywhere.length === 0) return () => false;

  return (text) => {
    if (!text) return false;
    const folded = fold(text);
    if (anywhere.length) {
      const joined = folded.replace(/\s+/g, '');
      if (anywhere.some((w) => joined.includes(w))) return true;
    }
    const tokens = words(folded).map(variants);
    for (let i = 0; i < tokens.length; i += 1) {
      for (const form of tokens[i]) {
        for (const phrase of byFirst.get(form) || []) {
          if (phrase.every((part, j) => j === 0 || tokens[i + j]?.has(part))) return true;
        }
      }
    }
    return false;
  };
}
