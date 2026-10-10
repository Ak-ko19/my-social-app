import { useContext } from 'react';
import HiddenWordsContext from '../context/HiddenWordsContext';

// Day 49: the signed-in person's Hidden words. check(text) answers null
// (show it), 'warn' (cover it) or 'hide' (leave it out).
export function useHiddenWords() {
  return useContext(HiddenWordsContext);
}
