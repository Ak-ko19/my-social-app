import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from './safeUrl';
import { serverErrorText, serverText } from './serverError';
import { formatDate, setLanguage } from '../i18n';

describe('safeHttpUrl', () => {
  it('keeps absolute http(s) URLs', () => {
    expect(safeHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
  });

  it('refuses script, data and relative URLs, and non-strings', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '/relative', 'example.com', '', null, undefined, 42, {}]) {
      expect(safeHttpUrl(bad)).toBeNull();
    }
  });
});

describe('serverErrorText / serverText', () => {
  const err = (data) => ({ response: { data } });

  it('shows the server message, translated when a translation exists', async () => {
    expect(serverErrorText(err('Post not found'), 'common.somethingWentWrong')).toBe('Post not found');
    await setLanguage('my');
    expect(serverErrorText(err('Post not found'), 'common.somethingWentWrong')).toBe('ပို့စ် မတွေ့ပါ');
    await setLanguage('ar');
    expect(serverErrorText(err({ message: 'This account is suspended' }), 'common.somethingWentWrong')).toBe('هذا الحساب موقوف مؤقتًا');
    expect(serverText('Please wait a moment and try again.')).toBe('يرجى الانتظار قليلًا ثم المحاولة مجددًا.');
  });

  it('falls back to the screen\'s own message when the server sent nothing usable', () => {
    expect(serverErrorText(new Error('Network Error'), 'auth.loginFailed')).toBe('Login failed. Please check your email and password.');
    expect(serverErrorText(err({}), 'auth.loginFailed')).toBe('Login failed. Please check your email and password.');
  });

  it('passes an unknown message through untranslated rather than hiding it', async () => {
    await setLanguage('my');
    expect(serverErrorText(err('Some brand new server message'), 'common.somethingWentWrong')).toBe('Some brand new server message');
  });
});

describe('formatDate', () => {
  const d = new Date(2026, 9, 3, 18, 53, 9);

  it('longTime: the date and hour:minute, never the seconds', () => {
    const text = formatDate(d, 'longTime');
    expect(text).toContain('2026');
    expect(text).toMatch(/0?6:53|18:53/);
    expect(text).not.toContain(':09');
  });

  it('is empty for an invalid date instead of "Invalid Date"', () => {
    expect(formatDate('not a date')).toBe('');
    expect(formatDate('not a date', 'longTime')).toBe('');
  });
});
