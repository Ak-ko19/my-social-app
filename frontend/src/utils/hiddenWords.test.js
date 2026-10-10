import { describe, expect, it } from 'vitest';
import { buildMatcher, fold } from './hiddenWords';
import BUILT_IN from '../data/offensiveWords';

// Day 49: the Hidden words matcher.
describe('hidden words matcher', () => {
  const builtIn = buildMatcher(BUILT_IN);

  it('matches whole words only, in any case', () => {
    expect(builtIn('What the FUCK')).toBe(true);
    expect(builtIn('you ass.')).toBe(true);
    for (const clean of ['a class act', 'pass the salt', 'Scunthorpe United', 'assess the cocktail', 'Dickens', 'shiitake']) {
      expect(builtIn(clean)).toBe(false);
    }
  });

  it('sees through stretched letters and symbols inside words', () => {
    expect(builtIn('fuuuuck')).toBe(true);
    expect(builtIn('sh1t')).toBe(true);
    expect(builtIn('a$$hole')).toBe(true);
    expect(builtIn('B!TCH')).toBe(false); // not a letter: split, like Instagram's word match
    // Mentions, prices and numbers stay as they are.
    expect(fold('@bob paid $5 in 2024, b4 covid19')).toBe('@bob paid $5 in 2024, b4 covid19');
  });

  it('matches phrases as whole phrases', () => {
    expect(builtIn('just kill yourself')).toBe(true);
    expect(builtIn('kill the lights, yourself included')).toBe(false);
  });

  it('Arabic: letter forms, diacritics, tatweel, prefixes and stretching fold together', () => {
    expect(fold('شَرْمُوطَة')).toBe('شرموطه');
    expect(builtIn('يا شرموطه')).toBe(true);
    expect(builtIn('يا شرمـــوطة')).toBe(true);
    expect(builtIn('شرموووطة')).toBe(true);
    expect(builtIn('والشرموطة')).toBe(true);
    expect(builtIn('يا إبن الكلب')).toBe(true);
    // Whole words: these only contain the letters.
    for (const clean of ['كسر الزجاج', 'مكسور', 'زبدة', 'نيكول', 'الطقس جميل', 'بيت الكلب']) {
      expect(builtIn(clean)).toBe(false);
    }
  });

  it('your own words, any language; scripts without spaces match inside the text', () => {
    const mine = buildMatcher(['Spoiler', 'حرق الأحداث', 'ネタバレ', 'ပျက်စီး']);
    expect(mine('No SPOILERS please')).toBe(false); // whole words
    expect(mine('spoiler: he dies')).toBe(true);
    expect(mine('بدون حرق الاحداث')).toBe(true);
    expect(mine('これはネタバレです')).toBe(true);
    expect(mine('ဒါပျက်စီးတယ်')).toBe(true);
    expect(mine('nothing here')).toBe(false);
  });

  it('nothing to match: never true', () => {
    expect(buildMatcher([])('fuck')).toBe(false);
    expect(buildMatcher(['  ', '!!'])('anything !!')).toBe(false);
    expect(builtIn('')).toBe(false);
    expect(builtIn(null)).toBe(false);
  });
});
