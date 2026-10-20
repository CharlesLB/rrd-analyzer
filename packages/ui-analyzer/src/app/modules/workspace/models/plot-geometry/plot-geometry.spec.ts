import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { CPU_USER_SERIES, MEMORY_USED_SERIES, seriesFixture } from '../../../../stores/workspace/models/series/series.fixture';
import type { SampledLine } from '../../../../stores/workspace/models/series/series.model';
import { valueAxesOf } from '../../../../stores/workspace/models/value-axis/value-axis';
import {
  axisLabelRowsOf,
  axisLabelsOf,
  columnFractionOf,
  HORIZONTAL_GRID_LINES,
  lastPresentOf,
  plotPathOf,
  plotXOf,
  sampleAtFraction,
  timeTicksOf,
  VERTICAL_GRID_LINES,
} from './plot-geometry';

const units = messagesFor().units;

describe('plotPathOf', () => {
  it('draws across a thousand units and down from four to ninety-six, lifting the pen over holes', () => {
    expect(plotPathOf([0, 50, null, 100], { lowest: 0, highest: 100 })).toBe('M0.0 96.0 L333.3 50.0 M1000.0 4.0');
  });

  it('plotPathOf readings below zero draws them inside the plot, the lowest at its foot', () => {
    expect(plotPathOf([-50, -25, 0], { lowest: -50, highest: 0 })).toBe('M0.0 96.0 L500.0 50.0 L1000.0 4.0');
  });

  it('draws nothing for a window of holes', () => {
    expect(plotPathOf([null, null], { lowest: 0, highest: 1 })).toBe('');
  });
});

describe('grid and labels', () => {
  it('rules four horizontal lines at the label positions and a vertical line between every pair of time ticks', () => {
    expect(HORIZONTAL_GRID_LINES).toEqual(['4.0', '34.7', '65.3', '96.0']);
    expect(VERTICAL_GRID_LINES).toEqual(['125.0', '250.0', '375.0', '500.0', '625.0', '750.0', '875.0']);
  });

  it('labels the axis from the maximum down to zero', () => {
    expect(axisLabelsOf({ lowest: 0, highest: 100 }, '%', units).map((label) => label.label)).toEqual(['100.0%', '66.7%', '33.3%', '0.0%']);
    expect(axisLabelsOf({ lowest: 0, highest: 100 }, '%', units)[0].topPercent).toBe('4%');
    expect(axisLabelsOf({ lowest: -60, highest: 0 }, '', units).map((label) => label.label)).toEqual(['0.000', '-20.00', '-40.00', '-60.00']);
  });
});

describe('cursor helpers', () => {
  it('reads the sample under a fraction of the plot, and the last reading of a window', () => {
    expect(sampleAtFraction([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(lastPresentOf([1, 2, null])).toBe(2);
    expect(lastPresentOf([null])).toBeNull();
  });

  it('turns fractions and instants into plot positions', () => {
    expect(plotXOf(250, { fromMilliseconds: 0, untilMilliseconds: 1000 })).toBe(250);
  });
});

describe('axis label rows', () => {
  const SYSTEM_SERIES = seriesFixture(4, { unit: '%', color: SERIES_COLORS[7] });

  const MERGED_LINES: readonly SampledLine[] = [
    { series: CPU_USER_SERIES, samples: [20, 140], axis: 0 },
    { series: MEMORY_USED_SERIES, samples: [2, 4], axis: 1 },
    { series: SYSTEM_SERIES, samples: [10, null], axis: 0 },
  ];

  it('axisLabelRowsOf a single axis labels the left side in the muted default color, as a chart of one series always has', () => {
    const rows = axisLabelRowsOf(valueAxesOf([{ series: CPU_USER_SERIES, samples: [20, 40], axis: 0 }]), units);

    expect(rows.map((row) => row.values)).toEqual([
      [{ text: '100.0%', color: null }],
      [{ text: '66.7%', color: null }],
      [{ text: '33.3%', color: null }],
      [{ text: '0.0%', color: null }],
    ]);
  });

  it('axisLabelRowsOf several axes labels each in the color of its axis, all of them side by side on the left', () => {
    const [top] = axisLabelRowsOf(valueAxesOf(MERGED_LINES), units);

    expect(top?.topPercent).toBe('4%');
    expect(top?.values).toEqual([
      { text: '151.2%', color: CPU_USER_SERIES.color },
      { text: '4.32 B', color: MEMORY_USED_SERIES.color },
    ]);
  });
});

describe('timeTicksOf', () => {
  it('puts each time label at the share of the plot its gridline is ruled at, the two ends turned inward', () => {
    const ticks = timeTicksOf({ fromMilliseconds: new Date(2026, 7, 28, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() });

    expect(ticks.map((tick) => tick.left)).toEqual(['0.00%', '12.50%', '25.00%', '37.50%', '50.00%', '62.50%', '75.00%', '87.50%', '100.00%']);
    expect(ticks.map((tick) => tick.alignment)).toEqual(['start', 'middle', 'middle', 'middle', 'middle', 'middle', 'middle', 'middle', 'end']);
    expect(ticks[1]?.label).toBe('28/08 18:00');
  });
});

describe('columnFractionOf', () => {
  it('moves a pointer position onto the sample column nearest to it, so a move inside one column changes nothing', () => {
    expect(columnFractionOf(0.4, 4)).toBeCloseTo(1 / 3);
    expect(columnFractionOf(0.38, 4)).toBe(columnFractionOf(0.4, 4));
    expect([columnFractionOf(0, 260), columnFractionOf(1, 260)]).toEqual([0, 1]);
  });

  it('leaves the position alone when there is no column to move it onto', () => {
    expect([columnFractionOf(0.4, 0), columnFractionOf(0.4, 1)]).toEqual([0.4, 0.4]);
  });
});
