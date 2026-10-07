import { describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import { formatRelativeTime } from './formatRelativeTime';

const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();
const DAY = 86400;

describe('formatRelativeTime', () => {
  it('English: short forms', async () => {
    expect(formatRelativeTime(ago(5))).toBe('just now');
    expect(formatRelativeTime(ago(3 * 60))).toBe('3m ago');
    expect(formatRelativeTime(ago(1 * DAY))).toBe('1d ago');
    expect(formatRelativeTime(ago(3 * DAY))).toBe('3d ago');
  });

  // Arabic counts take different noun forms: 1, 2, 3-10, 11-99.
  it('Arabic: the right plural form for each count', async () => {
    await setLanguage('ar');
    expect(formatRelativeTime(ago(5))).toBe('الآن');
    expect(formatRelativeTime(ago(1 * DAY))).toBe('منذ يوم');
    expect(formatRelativeTime(ago(2 * DAY))).toBe('منذ يومين');
    expect(formatRelativeTime(ago(3 * DAY))).toBe('منذ 3 أيام');
    expect(formatRelativeTime(ago(2 * 7 * DAY))).toBe('منذ أسبوعين');
    expect(formatRelativeTime(ago(11 * 30 * DAY))).toBe('منذ 11 شهرًا');
    expect(formatRelativeTime(ago(3 * 365 * DAY))).toBe('منذ 3 سنوات');
    expect(formatRelativeTime(ago(5 * 3600))).toBe('منذ 5 س');
  });
});
