import { describe, expect, it } from 'vitest';
import { timeTickInstantsOf } from './time-axis';

describe('timeTickInstantsOf', () => {
  it('timeTickInstantsOf ticks nine instants from the start of the window to its end', () => {
    expect(timeTickInstantsOf({ fromMilliseconds: 0, untilMilliseconds: 400 })).toEqual([0, 50, 100, 150, 200, 250, 300, 350, 400]);
  });
});
