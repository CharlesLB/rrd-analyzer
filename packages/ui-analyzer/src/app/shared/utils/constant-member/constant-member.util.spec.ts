import { describe, expect, it } from 'vitest';
import { memberOf } from './constant-member.util';

const COLORS = {
  RED: 'red',
  BLUE: 'blue',
} as const;

describe('memberOf', () => {
  it('returns the constant a string names, and nothing for a string outside the set', () => {
    expect(memberOf(COLORS, 'blue')).toBe(COLORS.BLUE);
    expect(memberOf(COLORS, 'green')).toBeUndefined();
  });
});
