import { describe, expect, it } from 'vitest';
import { percentOf } from './percent.util';

describe('percentOf', () => {
  it('percentOf a fraction writes it as a percentage, to two decimals unless asked for fewer', () => {
    expect(percentOf(0.1234)).toBe('12.34%');
    expect(percentOf(0.1234, 0)).toBe('12%');
    expect(percentOf(1)).toBe('100.00%');
  });
});
