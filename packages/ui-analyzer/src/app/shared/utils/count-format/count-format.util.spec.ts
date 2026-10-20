import { describe, expect, it } from 'vitest';
import { formatCount } from './count-format.util';

describe('formatCount', () => {
  it('formatCount, for a count past a thousand, groups the digits', () => {
    expect(formatCount(812)).toBe('812');
    expect(formatCount(16736)).toBe('16,736');
  });
});
