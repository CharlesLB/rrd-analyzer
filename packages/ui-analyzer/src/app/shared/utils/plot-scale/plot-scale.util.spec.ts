import { describe, expect, it } from 'vitest';
import { sampleExtentOf, scaledY } from './plot-scale.util';

describe('sampleExtentOf', () => {
  it('sampleExtentOf with gaps between readings spans the readings and ends on the last one', () => {
    const samples = [null, 4, 9, null, 2, null];

    const extent = sampleExtentOf(samples);

    expect(extent).toEqual({ lowest: 2, highest: 9, last: 2 });
  });

  it('sampleExtentOf over nothing but gaps has no extent', () => {
    const samples = [null, null];

    const extent = sampleExtentOf(samples);

    expect(extent).toBeNull();
  });
});

describe('sampleExtentOf over a long series', () => {
  it('sampleExtentOf spans a series far longer than a call can take as arguments', () => {
    const samples = Array.from({ length: 600_000 }, (_unused, index) => index - 5);

    const extent = sampleExtentOf(samples);

    expect(extent).toEqual({ lowest: -5, highest: 599_994, last: 599_994 });
  });
});

describe('scaledY', () => {
  it('scaledY over a range with no height places the value on the middle of the band rather than nowhere', () => {
    const band = { top: 4, height: 92 };

    const position = scaledY(7, { lowest: 7, highest: 7 }, band);

    expect(position).toBe(50);
  });

  it('scaledY places zero on the bottom of the band and the maximum on its top', () => {
    const band = { top: 4, height: 92 };

    const range = { lowest: 0, highest: 50 };

    const positions = [scaledY(0, range, band), scaledY(25, range, band), scaledY(50, range, band)];

    expect(positions).toEqual([96, 50, 4]);
  });
});
