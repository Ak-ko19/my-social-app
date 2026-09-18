import { createContext } from 'react';

// { theme: 'light' | 'dark', setTheme(theme), toggleTheme() } -- `theme` is
// always the *resolved* value actually applied, never 'system' itself; see
// ThemeProvider for how a 'system' (no explicit choice yet) state resolves.
const ThemeContext = createContext(null);

export default ThemeContext;
