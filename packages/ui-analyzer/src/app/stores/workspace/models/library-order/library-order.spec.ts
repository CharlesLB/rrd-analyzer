import { describe, expect, it } from 'vitest';
import { seriesFixture } from '../series/series.fixture';
import { isAtTopOfLibrary, movedToTopOfLibrary } from './library-order';

const LIBRARY = [seriesFixture(0), seriesFixture(1), seriesFixture(2), seriesFixture(3)];

describe('movedToTopOfLibrary', () => {
  it('lifts the series to the head of the library and keeps every other series in the order it had', () => {
    const arranged = movedToTopOfLibrary(LIBRARY, 's2');

    expect(arranged.map((series) => series.id)).toEqual(['s2', 's0', 's1', 's3']);
  });

  it('hands back the same library for the series already at its head, so nothing is redrawn or saved', () => {
    expect(movedToTopOfLibrary(LIBRARY, 's0')).toBe(LIBRARY);
  });

  it('hands back the same library for a series it does not hold', () => {
    expect(movedToTopOfLibrary(LIBRARY, 's9')).toBe(LIBRARY);
  });
});

describe('isAtTopOfLibrary', () => {
  it('holds for the first series only, and for none of an empty library', () => {
    expect(isAtTopOfLibrary(LIBRARY, 's0')).toBe(true);
    expect(isAtTopOfLibrary(LIBRARY, 's1')).toBe(false);
    expect(isAtTopOfLibrary([], 's0')).toBe(false);
  });
});
