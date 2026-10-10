import { createContext } from 'react';

// Day 49: { mode, words, ready, check(text) -> null | 'warn' | 'hide',
// refresh(), setMode(mode), addWord(word), removeWord(word) } -- see
// HiddenWordsProvider. Without a provider (signed out, unit tests) the
// filter is off and nothing is covered.
const OFF = {
  mode: 'off',
  words: [],
  ready: false,
  check: () => null,
  refresh: async () => null,
  setMode: async () => {},
  addWord: async () => {},
  removeWord: async () => {}
};

const HiddenWordsContext = createContext(OFF);

export default HiddenWordsContext;
