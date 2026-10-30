import { describe, expect, it } from 'vitest';
import { done, REFUSALS, refused } from './session-outcome';

describe('session outcome', () => {
  it('done and refused, given a value or a refusal, hold exactly one of the two', () => {
    const accepted = done(3);
    const declined = refused<number>(REFUSALS.SESSION_TOO_LARGE);

    expect(accepted).toEqual({ refusal: null, value: 3 });
    expect(declined).toEqual({ refusal: 'session_too_large', value: null });
  });
});
