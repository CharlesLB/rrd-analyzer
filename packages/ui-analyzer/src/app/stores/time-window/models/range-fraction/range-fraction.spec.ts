import { describe, expect, it } from 'vitest';
import { instantAt } from '../../../workspace/models/timeframe/timeframe';
import { fractionAt, holdsInstant } from './range-fraction';

const RANGE = { fromMilliseconds: 1000, untilMilliseconds: 5000 };

describe('fractionAt', () => {
  it('fractionAt an instant is the share of the range before it, the way back from instantAt, and runs past either end', () => {
    expect([1000, 2000, 5000].map((instant) => fractionAt(RANGE, instant))).toEqual([0, 0.25, 1]);
    expect(fractionAt(RANGE, instantAt(RANGE, 0.6))).toBeCloseTo(0.6);
    expect(fractionAt(RANGE, 0)).toBe(-0.25);
  });
});

describe('holdsInstant', () => {
  it('holdsInstant counts both ends of the range as inside it', () => {
    expect([999, 1000, 3000, 5000, 5001].map((instant) => holdsInstant(RANGE, instant))).toEqual([false, true, true, true, false]);
  });
});
