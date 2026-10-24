import { describe, expect, it } from 'vitest';
import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE, MILLISECONDS_PER_SECOND } from './milliseconds';

describe('milliseconds', () => {
  it('a second, a minute, an hour and a day, each spelled in milliseconds, hold the lengths a clock gives them', () => {
    expect([MILLISECONDS_PER_SECOND, MILLISECONDS_PER_MINUTE, MILLISECONDS_PER_HOUR, MILLISECONDS_PER_DAY]).toEqual([1000, 60_000, 3_600_000, 86_400_000]);
  });
});
