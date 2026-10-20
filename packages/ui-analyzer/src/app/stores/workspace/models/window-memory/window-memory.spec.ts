import { describe, expect, it } from 'vitest';
import { mergedChartData, rememberedWindow, seriesMissingFrom, windowKeyOf } from './window-memory';

const QUERY = { analysisId: 'a1', seriesIds: ['s1', 's0'], fromMilliseconds: 1000, untilMilliseconds: 2000, columns: 260 };
const HELD = { tracks: { s0: [1, 2] }, statistics: { s0: null } };

describe('windowKeyOf', () => {
  it('windowKeyOf a query names the analysis, the window and the columns, whatever series it asks for', () => {
    const askingForOtherSeries = { ...QUERY, seriesIds: ['s7'] };

    expect(windowKeyOf(QUERY)).toBe('a1|1000|2000|260');
    expect(windowKeyOf(askingForOtherSeries)).toBe(windowKeyOf(QUERY));
  });
});

describe('rememberedWindow', () => {
  it('rememberedWindow keeps the eight windows seen last, the one just used counting as the latest', () => {
    const nine = Array.from({ length: 9 }, (_unused, index) => `w${index}`).reduce((memory, key) => rememberedWindow(memory, key, key), {});
    const reused = rememberedWindow(rememberedWindow({ w0: 'w0', w1: 'w1' }, 'w0', 'again'), 'w2', 'w2');

    expect(Object.keys(nine)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8']);
    expect(Object.entries(reused)).toEqual([
      ['w1', 'w1'],
      ['w0', 'again'],
      ['w2', 'w2'],
    ]);
  });
});

describe('seriesMissingFrom', () => {
  it('seriesMissingFrom a window lists only the series it holds no columns for', () => {
    expect(seriesMissingFrom(HELD, ['s0', 's1', 's2'])).toEqual(['s1', 's2']);
    expect(seriesMissingFrom(HELD, ['s0'])).toEqual([]);
  });
});

describe('mergedChartData', () => {
  it('mergedChartData adds the series just fetched to those already held', () => {
    expect(mergedChartData(HELD, { tracks: { s1: [3] }, statistics: { s1: null } })).toEqual({
      tracks: { s0: [1, 2], s1: [3] },
      statistics: { s0: null, s1: null },
    });
  });
});
