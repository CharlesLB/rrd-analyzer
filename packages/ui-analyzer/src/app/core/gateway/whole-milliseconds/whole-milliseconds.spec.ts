import { describe, expect, it } from 'vitest';
import { wholeMillisecondsOf } from './whole-milliseconds';

describe('wholeMillisecondsOf', () => {
  it('wholeMillisecondsOf a range zoomed to fractions of a millisecond rounds both edges and keeps the rest of the request', () => {
    const request = { analysisId: 'a1', fromMilliseconds: 1000.4, untilMilliseconds: 2999.6 };

    const whole = wholeMillisecondsOf(request);

    expect(whole).toEqual({ analysisId: 'a1', fromMilliseconds: 1000, untilMilliseconds: 3000 });
  });
});
