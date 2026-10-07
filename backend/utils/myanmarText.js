// Day 43: Zawgyi -> Unicode for Myanmar text people write.
//
// Zawgyi is an old Myanmar font that reuses Unicode's Myanmar code points
// with different meanings, so the same bytes read as garbage under the
// other encoding. Text is converted on the way IN, so storage, search,
// hashtags, mentions and notifications all see Unicode whatever font the
// writer's phone uses.
//
// Google's myanmar-tools (offline, no API) decides how likely a string is
// Zawgyi. Converting text that is already Unicode corrupts it, so a line
// is only converted when the detector is confident:
//   - P >= 0.95: Zawgyi, convert;  P <= 0.05: Unicode, keep;
//   - in between (very short lines, e.g. one letter): follow the whole
//     text's verdict -- a one-word line inside a Zawgyi post is Zawgyi too.
// Per line, because a post can paste a Zawgyi paragraph into Unicode text.
const { ZawgyiDetector, ZawgyiConverter } = require('myanmar-tools');

const detector = new ZawgyiDetector();
const converter = new ZawgyiConverter();

const ZAWGYI = 0.95;
const UNICODE = 0.05;
// Myanmar block plus Extended-A/B. Text without these is returned as is
// (the detector scores non-Myanmar text -Infinity).
const MYANMAR = /[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/;
// Converting costs ~0.3 ms per line of real Zawgyi. Nothing people write is
// allowed to be longer than a post (10,000), so longer text -- which its
// route refuses anyway -- is returned as is rather than converted first.
const MAX_CONVERT_LENGTH = 10000;

function toUnicode(text) {
  if (typeof text !== 'string' || text.length > MAX_CONVERT_LENGTH || !MYANMAR.test(text)) return text;
  let wholeIsZawgyi; // scored only if a line needs it
  return text
    .split('\n')
    .map((line) => {
      if (!MYANMAR.test(line)) return line;
      const p = detector.getZawgyiProbability(line);
      let zawgyi = p >= ZAWGYI;
      if (!zawgyi && p > UNICODE) {
        wholeIsZawgyi ??= detector.getZawgyiProbability(text) >= ZAWGYI;
        zawgyi = wholeIsZawgyi;
      }
      return zawgyi ? converter.zawgyiToUnicode(line) : line;
    })
    .join('\n');
}

module.exports = { toUnicode };
