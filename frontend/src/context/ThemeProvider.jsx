import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import ThemeContext from './ThemeContext';

const STORAGE_KEY = 'theme';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function resolveSystemTheme() {
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // localStorage can throw in some private-browsing modes.
    return null;
  }
}

// Centralizes theme state for the whole app (index.css's tokens are global,
// not Feed-scoped, so this lives above <App/>, not inside the Feed tree).
// The inline script in index.html already set the correct data-theme
// attribute on <html> before React even loaded, specifically to avoid a
// flash of the wrong theme on first paint -- this provider's job from here
// is to keep that attribute in sync with explicit user choices and with
// live system-preference changes, and to expose the current value to
// components (e.g. ThemeToggle) that need it.
export function ThemeProvider({ children }) {
  const [explicitTheme, setExplicitTheme] = useState(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState(resolveSystemTheme);

  // No explicit choice yet -- track the OS setting live.
  const resolvedTheme = explicitTheme || systemTheme;

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (explicitTheme) return; // an explicit choice overrides system tracking
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = (event) => setSystemTheme(event.matches ? 'dark' : 'light');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [explicitTheme]);

  const setTheme = useCallback((theme) => {
    setExplicitTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Theme still applies for this session via React state either way,
      // it just won't persist across reloads.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme: resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
