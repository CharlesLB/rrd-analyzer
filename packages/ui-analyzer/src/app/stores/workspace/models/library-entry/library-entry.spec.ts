import { describe, expect, it } from 'vitest';
import { CPU_USER_SERIES } from '../series/series.fixture';
import type { LibraryEntry, Series } from '../series/series.model';
import { withUnchangedEntriesKept } from './library-entry';

const SAMPLES = [1, 2, 3];

const SERIES: readonly Series[] = [0, 1, 2].map((index) => ({ ...CPU_USER_SERIES, id: `s${index}` }));

const entryOf = (index: number, overrides: Partial<LibraryEntry> = {}): LibraryEntry => ({
  series: SERIES[index] ?? CPU_USER_SERIES,
  samples: SAMPLES,
  isOnCanvas: false,
  isActive: false,
  ...overrides,
});

describe('withUnchangedEntriesKept', () => {
  it('withUnchangedEntriesKept, when one entry changed, keeps the others as the objects they were', () => {
    const previous = [entryOf(0), entryOf(1), entryOf(2)];

    const kept = withUnchangedEntriesKept([entryOf(0), entryOf(1, { isActive: true, isOnCanvas: true }), entryOf(2)], previous);

    expect(kept[0]).toBe(previous[0]);
    expect(kept[1]).not.toBe(previous[1]);
    expect(kept[1]?.isActive).toBe(true);
    expect(kept[2]).toBe(previous[2]);
  });

  it('withUnchangedEntriesKept, when nothing changed, keeps the list itself', () => {
    const previous = [entryOf(0), entryOf(1)];

    expect(withUnchangedEntriesKept([entryOf(0), entryOf(1)], previous)).toBe(previous);
  });

  it('withUnchangedEntriesKept, when the library is narrowed or reordered, keeps the entries and lists them as asked', () => {
    const previous = [entryOf(0), entryOf(1), entryOf(2)];

    const kept = withUnchangedEntriesKept([entryOf(2), entryOf(0)], previous);

    expect(kept).toEqual([previous[2], previous[0]]);
    expect(kept[0]).toBe(previous[2]);
  });

  it('withUnchangedEntriesKept, for an entry whose samples arrived, takes the new entry', () => {
    const previous = [entryOf(0, { samples: [] })];

    expect(withUnchangedEntriesKept([entryOf(0)], previous)[0]?.samples).toBe(SAMPLES);
  });
});
