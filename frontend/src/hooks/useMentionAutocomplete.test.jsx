import { describe, expect, it } from 'vitest';
import { applyMentionSelection } from './useMentionAutocomplete';

describe('applyMentionSelection', () => {
  it('replaces the @partial at the cursor with the chosen name', () => {
    const value = 'hi @bo and more';
    expect(applyMentionSelection(value, 6, 'bob')).toEqual({ value: 'hi @bob  and more', cursorPos: 8 });
  });

  it('works for a Burmese partial name (Day 43)', () => {
    // "@ကို" typed so far -- its vowel signs are marks, not \w.
    const value = 'မင်္ဂလာပါ @ကို';
    expect(applyMentionSelection(value, value.length, 'ကိုကို')).toEqual({ value: 'မင်္ဂလာပါ @ကိုကို ', cursorPos: 'မင်္ဂလာပါ @ကိုကို '.length });
  });

  it('leaves text alone when no mention is being typed', () => {
    expect(applyMentionSelection('mail me at a@b', 14, 'bob')).toEqual({ value: 'mail me at a@b', cursorPos: 14 });
  });
});
