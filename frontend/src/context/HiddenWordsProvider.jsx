import { useCallback, useEffect, useMemo, useState } from 'react';
import HiddenWordsContext from './HiddenWordsContext';
import { useAuth } from '../hooks/useAuth';
import { fetchHiddenWords, saveHiddenWordsMode, addHiddenWord, removeHiddenWord } from '../services/hiddenWordsService';

// Day 49: the signed-in person's Hidden words for the whole app (mirrors
// SocketProvider's placement in main.jsx). The mode and their own words
// come from the server and are kept per account in localStorage, so the
// first paint after a reload already covers what it should. The built-in
// English / Arabic list and the matcher are their own chunks, loaded only
// when the mode isn't off.
const cacheKey = (userId) => `hiddenWords:${userId}`;

function readCache(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey(userId)));
    if (saved && ['off', 'warn', 'hide'].includes(saved.mode) && Array.isArray(saved.words)) return saved;
  } catch {
    // A broken entry is replaced by the server's answer below.
  }
  return null;
}

function writeCache(userId, value) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(value));
  } catch {
    // Storage full or blocked: the filter still works for this visit.
  }
}

export function HiddenWordsProvider({ children }) {
  const { token, userId } = useAuth();
  // Whose settings: none signed out. What the server answered is kept with
  // the account it belongs to, so another account starts from its own
  // cache, never the previous one's words.
  const account = token && userId ? userId : null;
  const cached = useMemo(() => (account ? readCache(account) : null), [account]);
  const [loaded, setLoaded] = useState({ account: null, value: null });
  const settings = account === null ? null : loaded.account === account ? loaded.value : cached;
  // { list, buildMatcher }: the built-in list and the matcher, one chunk.
  const [filter, setFilter] = useState(null);

  useEffect(() => {
    if (!account) return undefined;
    let cancelled = false;
    fetchHiddenWords(token)
      .then((data) => {
        if (cancelled) return;
        setLoaded({ account, value: data });
        writeCache(account, data);
      })
      .catch(() => {
        // Offline or the server is waking up: keep the cached settings.
      });
    return () => {
      cancelled = true;
    };
  }, [token, account]);

  const mode = settings?.mode || 'off';
  useEffect(() => {
    if (mode === 'off' || filter) return;
    let cancelled = false;
    Promise.all([import('../data/offensiveWords'), import('../utils/hiddenWords')]).then(([list, matcher]) => {
      if (!cancelled) setFilter({ list: list.default, buildMatcher: matcher.buildMatcher });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, filter]);

  const words = useMemo(() => settings?.words || [], [settings]);
  const matches = useMemo(() => (filter ? filter.buildMatcher([...filter.list, ...words]) : () => false), [filter, words]);
  const check = useCallback((text) => (mode !== 'off' && matches(text) ? mode : null), [mode, matches]);

  const update = useCallback((next) => {
    setLoaded((prev) => {
      const value = { mode: 'warn', words: [], ...(prev.account === account ? prev.value : readCache(account)), ...next };
      writeCache(account, value);
      return { account, value };
    });
  }, [account]);

  // Settings > Hidden words loads fresh from the server; throws when it
  // can't (the screen shows why).
  const refresh = useCallback(async () => {
    const data = await fetchHiddenWords(token);
    setLoaded({ account, value: data });
    writeCache(account, data);
    return data;
  }, [token, account]);

  // Each answers with the server's result, or throws (the screen shows why).
  // The mode changes at once (the feed follows), and goes back if saving fails.
  const setMode = useCallback(async (next) => {
    const previous = mode;
    update({ mode: next });
    try {
      update({ mode: await saveHiddenWordsMode(next, token) });
    } catch (err) {
      update({ mode: previous });
      throw err;
    }
  }, [mode, token, update]);
  const addWord = useCallback(async (word) => update({ words: await addHiddenWord(word, token) }), [token, update]);
  const removeWord = useCallback(async (word) => update({ words: await removeHiddenWord(word, token) }), [token, update]);

  const value = useMemo(
    () => ({ mode, words, ready: Boolean(settings), check, refresh, setMode, addWord, removeWord }),
    [mode, words, settings, check, refresh, setMode, addWord, removeWord]
  );
  return <HiddenWordsContext.Provider value={value}>{children}</HiddenWordsContext.Provider>;
}
