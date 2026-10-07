import { afterEach, describe, expect, it, vi } from 'vitest';

// Owner decision 2026-10-07: English and Arabic are the only UI languages.
// Myanmar was one before, so devices and accounts may still say 'my'.
// Each test loads a fresh copy of the i18n module, as a new page load does.
async function freshLoad() {
  vi.resetModules();
  const mod = await import('./index.js');
  await mod.i18nReady;
  return mod;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UI languages', () => {
  it('are English and Arabic only', async () => {
    const { LANGUAGES } = await freshLoad();
    expect(LANGUAGES.map((l) => [l.code, l.dir])).toEqual([['en', 'ltr'], ['ar', 'rtl']]);
  });

  it('a device that had Myanmar saved starts in English and saves that', async () => {
    localStorage.setItem('lang', 'my');
    localStorage.setItem('langPending', '1'); // a logged-out pick of Myanmar
    const { default: i18n } = await freshLoad();
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(localStorage.getItem('lang')).toBe('en');
    // Not passed off as a choice: the next login won't save it to the account.
    expect(localStorage.getItem('langPending')).toBeNull();
  });

  it('a saved Arabic choice still starts in Arabic, right to left', async () => {
    localStorage.setItem('lang', 'ar');
    localStorage.setItem('langPending', '1');
    const { default: i18n } = await freshLoad();
    expect(i18n.language).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('langPending')).toBe('1'); // a real pick: kept
  });

  it('a Burmese browser with nothing saved gets English; an Arabic one gets Arabic', async () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'my-MM' });
    expect((await freshLoad()).default.language).toBe('en');
    localStorage.clear();
    vi.stubGlobal('navigator', { ...navigator, language: 'ar-EG' });
    expect((await freshLoad()).default.language).toBe('ar');
  });

  it('switching to a language the app does not offer means English', async () => {
    const { default: i18n, setLanguage } = await freshLoad();
    await setLanguage('ar');
    await setLanguage('my');
    expect(i18n.language).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
