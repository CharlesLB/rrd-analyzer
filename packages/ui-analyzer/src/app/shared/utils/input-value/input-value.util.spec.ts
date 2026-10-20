import { describe, expect, it } from 'vitest';
import { inputValueOf } from './input-value.util';

describe('inputValueOf', () => {
  it('reads the current text of the input that raised the event', () => {
    const input = document.createElement('input');
    input.value = 'atlas';

    expect(inputValueOf({ target: input } as unknown as Event)).toBe('atlas');
  });
});
