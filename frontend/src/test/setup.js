// Vitest setup (vite.config.js): DOM matchers, a clean DOM and storage
// between tests, and the app's i18n in English -- the same instance the
// components use, so tests assert on real translated text.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { i18nReady, setLanguage } from '../i18n';

// jsdom has no matchMedia (the theme provider and motion's reduced-motion
// check use it): answer "no match", like a light-theme browser without
// reduced motion.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false
  });
}

beforeAll(async () => {
  await i18nReady;
  await setLanguage('en');
});

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await setLanguage('en');
});
