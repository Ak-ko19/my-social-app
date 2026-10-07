import { describe, expect, it } from 'vitest';
import { toLocalInputValue, fromLocalInputValue, scheduleProblem } from './draftService';

// Day 45: the date-time picker works in local time; the server in UTC.
describe('schedule time helpers', () => {
  it('round-trips a local date-time (minutes precision)', () => {
    const d = new Date(2026, 9, 7, 15, 15, 42);
    expect(toLocalInputValue(d)).toBe('2026-10-07T15:15');
    expect(fromLocalInputValue('2026-10-07T15:15').getTime()).toBe(new Date(2026, 9, 7, 15, 15).getTime());
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('nonsense')).toBeNull();
  });

  it('5 minutes to 30 days ahead, like the server', () => {
    const now = new Date(2026, 9, 7, 12, 0);
    const at = (minutes) => new Date(now.getTime() + minutes * 60 * 1000);
    expect(scheduleProblem(null, now)).toBe('drafts.scheduleInvalid');
    expect(scheduleProblem(at(4), now)).toBe('drafts.scheduleTooSoon');
    expect(scheduleProblem(at(5), now)).toBeNull();
    expect(scheduleProblem(at(30 * 24 * 60), now)).toBeNull();
    expect(scheduleProblem(at(30 * 24 * 60 + 1), now)).toBe('drafts.scheduleTooLate');
  });
});
