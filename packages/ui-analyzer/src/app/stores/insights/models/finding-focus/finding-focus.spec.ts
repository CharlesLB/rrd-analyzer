import { describe, expect, it } from 'vitest';
import { clampedFocusOf, movedFocusOf } from './finding-focus';

describe('clampedFocusOf', () => {
  it('keeps a focus past the last finding on the last one', () => {
    expect(clampedFocusOf(1, 3)).toBe(1);
    expect(clampedFocusOf(5, 3)).toBe(2);
  });
});

describe('movedFocusOf', () => {
  it('moves the focus by the offset without leaving the list at either end', () => {
    expect(movedFocusOf(0, 3, 1)).toBe(1);
    expect(movedFocusOf(2, 3, 1)).toBe(2);
    expect(movedFocusOf(0, 3, -1)).toBe(0);
    expect(movedFocusOf(7, 3, -1)).toBe(1);
  });
});
