import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 49: your Hidden words (backend controllers/hiddenWordsController.js).
// { mode: 'off' | 'warn' | 'hide', words: [...] }
export function fetchHiddenWords(token) {
  return api.get('/hidden-words', authHeaders(token)).then((res) => res.data);
}

export function saveHiddenWordsMode(mode, token) {
  return api.put('/hidden-words/mode', { mode }, authHeaders(token)).then((res) => res.data.mode);
}

// Both answer with your whole list, newest first.
export function addHiddenWord(word, token) {
  return api.post('/hidden-words', { word }, authHeaders(token)).then((res) => res.data.words);
}

export function removeHiddenWord(word, token) {
  return api.delete(`/hidden-words/${encodeURIComponent(word)}`, authHeaders(token)).then((res) => res.data.words);
}
