import { describe, expect, it } from 'vitest';
import { chartFixture } from '../plotted-chart/plotted-chart.fixture';
import { CPU_USER_SERIES, MEMORY_USED_SERIES } from './series.fixture';
import { haveSameLines, plottedLinesOf, seriesFor, seriesIdsOfLines, tracksOf } from './series.model';

describe('seriesFor', () => {
  it('seriesFor with identifiers in any order returns their series in that order', () => {
    const seriesById = new Map([CPU_USER_SERIES, MEMORY_USED_SERIES].map((series) => [series.id, series] as const));

    const found = seriesFor(['s5', 's3'], seriesById);

    expect(found).toEqual([MEMORY_USED_SERIES, CPU_USER_SERIES]);
  });

  it('seriesFor an identifier the analysis does not hold leaves it out', () => {
    const seriesById = new Map([[CPU_USER_SERIES.id, CPU_USER_SERIES]]);

    const found = seriesFor(['s9', 's3'], seriesById);

    expect(found).toEqual([CPU_USER_SERIES]);
  });
});

describe('plottedLinesOf', () => {
  it('plottedLinesOf pairs each series a chart plots with its axis, in the chart order, and skips a series the library no longer has', () => {
    const seriesById = new Map([
      [CPU_USER_SERIES.id, CPU_USER_SERIES],
      [MEMORY_USED_SERIES.id, MEMORY_USED_SERIES],
    ]);

    const chart = chartFixture({ seriesId: MEMORY_USED_SERIES.id, axis: 0 }, { seriesId: 'gone', axis: 1 }, { seriesId: CPU_USER_SERIES.id, axis: 2 });

    expect(plottedLinesOf(chart, seriesById)).toEqual([
      { series: MEMORY_USED_SERIES, axis: 0 },
      { series: CPU_USER_SERIES, axis: 2 },
    ]);
  });
});

describe('seriesIdsOfLines', () => {
  it('seriesIdsOfLines lists the series of every line of every chart, chart after chart', () => {
    const charts = [{ lines: [{ series: CPU_USER_SERIES, axis: 0 }] }, { lines: [{ series: MEMORY_USED_SERIES, axis: 0 }] }];

    expect(seriesIdsOfLines(charts)).toEqual([CPU_USER_SERIES.id, MEMORY_USED_SERIES.id]);
  });
});

describe('tracksOf', () => {
  it('tracksOf lists each series under its identifier, holes included', () => {
    expect(
      tracksOf([
        { seriesId: 's0', samples: [1, null, 3] },
        { seriesId: 's1', samples: [] },
      ]),
    ).toEqual({ s0: [1, null, 3], s1: [] });
  });
});

describe('haveSameLines', () => {
  const samples = [1, 2, 3];
  const line = { series: CPU_USER_SERIES, axis: 0, samples, statistics: null };

  it('haveSameLines holds for lines rebuilt around the same series, samples and statistics', () => {
    expect(haveSameLines([line], [{ ...line }])).toBe(true);
  });

  it('haveSameLines tells apart a line with other samples, another axis or one line more', () => {
    expect(haveSameLines([line], [{ ...line, samples: [1, 2, 3] }])).toBe(false);
    expect(haveSameLines([line], [{ ...line, axis: 1 }])).toBe(false);
    expect(haveSameLines([line], [line, { ...line, series: MEMORY_USED_SERIES }])).toBe(false);
  });
});
