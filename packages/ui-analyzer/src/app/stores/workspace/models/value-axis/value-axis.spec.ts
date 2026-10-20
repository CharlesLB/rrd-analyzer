import { describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { CPU_USER_SERIES, MEMORY_USED_SERIES, seriesFixture } from '../series/series.fixture';
import type { SampledLine } from '../series/series.model';
import { plotRangeOf, rangedLinesOf, valueAxesOf } from './value-axis';

describe('plotRangeOf', () => {
  it('plotRangeOf pins a percentage chart to a hundred and gives everything else eight percent of headroom from zero', () => {
    expect(plotRangeOf([10, 20], '%')).toEqual({ lowest: 0, highest: 100 });
    expect(plotRangeOf([10, null, 50], 'ms').lowest).toBe(0);
    expect(plotRangeOf([10, null, 50], 'ms').highest).toBeCloseTo(54);
  });

  it('plotRangeOf a percentage above a hundred reaches past it rather than drawing off the chart', () => {
    expect(plotRangeOf([40, 390], '%').highest).toBeCloseTo(421.2);
  });

  it('plotRangeOf readings below zero reaches down to them, with the same headroom', () => {
    const range = plotRangeOf([-50, -30], '');

    expect(range.lowest).toBeCloseTo(-54);
    expect(range.highest).toBe(0);
    expect(plotRangeOf([-20, 40], '').lowest).toBeCloseTo(-21.6);
    expect(plotRangeOf([-20, 40], '').highest).toBeCloseTo(43.2);
  });

  it('plotRangeOf a window of holes or of zeros falls back to a unit scale', () => {
    expect(plotRangeOf([null, null], 'B')).toEqual({ lowest: 0, highest: 1.08 });
    expect(plotRangeOf([0, 0], '').highest).toBeCloseTo(1.08);
  });
});

describe('value axes', () => {
  const SYSTEM_SERIES = seriesFixture(4, { unit: '%', color: SERIES_COLORS[7] });

  const MERGED_LINES: readonly SampledLine[] = [
    { series: CPU_USER_SERIES, samples: [20, 140], axis: 0 },
    { series: MEMORY_USED_SERIES, samples: [2, 4], axis: 1 },
    { series: SYSTEM_SERIES, samples: [10, null], axis: 0 },
  ];

  it('valueAxesOf gives each axis the unit and color of its first series, a range wide enough for every series on it', () => {
    expect(valueAxesOf(MERGED_LINES)).toEqual([
      { axis: 0, unit: '%', color: CPU_USER_SERIES.color, range: plotRangeOf([20, 140, 10, null], '%') },
      { axis: 1, unit: 'B', color: MEMORY_USED_SERIES.color, range: plotRangeOf([2, 4], 'B') },
    ]);
  });

  it('rangedLinesOf draws every series against the range of its own axis', () => {
    const axes = valueAxesOf(MERGED_LINES);

    expect(rangedLinesOf(MERGED_LINES, axes).map((line) => line.range)).toEqual([axes[0]?.range, axes[1]?.range, axes[0]?.range]);
  });
});
