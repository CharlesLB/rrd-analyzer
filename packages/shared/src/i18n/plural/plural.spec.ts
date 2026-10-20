import { describe, expect, it } from 'vitest';
import { formatPlural } from './plural';

const SOURCE_COUNT = { one: '{count} source', other: '{count} sources' };

describe('formatPlural', () => {
  it('picks the singular form for exactly one', () => {
    expect(formatPlural(SOURCE_COUNT, 1)).toBe('1 source');
  });

  it('picks the plural form for none and for many', () => {
    expect(formatPlural(SOURCE_COUNT, 0)).toBe('0 sources');
    expect(formatPlural(SOURCE_COUNT, 7)).toBe('7 sources');
  });

  it('interpolates the extra values a form names alongside the count', () => {
    expect(formatPlural({ one: '{count} series from {group}', other: '{count} series from {group}' }, 4, { group: 'cpu' })).toBe('4 series from cpu');
  });
});
