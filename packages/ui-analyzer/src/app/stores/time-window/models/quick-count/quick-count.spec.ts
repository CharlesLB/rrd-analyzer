import { describe, expect, it } from 'vitest';
import { quickCountOf } from './quick-count';

describe('quickCountOf', () => {
  it('reads a whole number of one or more, spaces around it aside', () => {
    expect(quickCountOf('6')).toBe(6);
    expect(quickCountOf(' 12 ')).toBe(12);
  });

  it('reads nothing from zero, a negative, a fraction, text or an empty field, instead of taking them for one', () => {
    expect(['0', '-3', '2.9', 'a few', '', '6h'].map(quickCountOf)).toEqual([null, null, null, null, null, null]);
  });
});
