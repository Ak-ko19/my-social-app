import { describe, expect, it } from 'vitest';
import { setLanguage } from '.';
import { translateServerText } from './serverMessages';

// Day 50: the Arabic server messages come with the Arabic strings (their
// own chunk), not in everyone's first download.
describe('server messages', () => {
  it('English text stays English; Arabic arrives with the Arabic strings', async () => {
    expect(translateServerText('Incorrect password', 'en')).toBe('Incorrect password');
    expect(translateServerText('Incorrect password', 'ar')).toBe('Incorrect password'); // not loaded yet
    await setLanguage('ar');
    expect(translateServerText('Incorrect password', 'ar')).toBe('كلمة المرور غير صحيحة');
    expect(translateServerText('Loading things failed. Please try again later.', 'ar')).toBe('فشلت العملية. يرجى المحاولة لاحقًا.');
    expect(translateServerText('Something new from the server', 'ar')).toBe('Something new from the server');
    expect(translateServerText(undefined, 'ar')).toBeUndefined();
    await setLanguage('en');
  });
});
