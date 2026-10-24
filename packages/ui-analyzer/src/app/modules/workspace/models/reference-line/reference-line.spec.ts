import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { SeriesStatistics } from '../../../../stores/workspace/models/series/series.model';
import { STATISTIC_KEYS, type StatisticKey } from '../../../../stores/workspace/models/statistic-key/statistic-key';
import { referenceLinesOf } from './reference-line';

const messages = messagesFor();
const RANGE = { lowest: 0, highest: 100 };

const statisticsOf = (overrides: Partial<SeriesStatistics> = {}): SeriesStatistics => ({
  minimum: 22.4,
  average: 42.6,
  maximum: 56.4,
  percentile95: 54.2,
  last: 35.8,
  gapCount: 0,
  ...overrides,
});

const linesOf = (keys: readonly StatisticKey[], statistics: SeriesStatistics | null = statisticsOf(), range = RANGE) =>
  referenceLinesOf(keys, statistics, range, messages.statistics, messages.units);

describe('referenceLinesOf', () => {
  it('puts each line at the height of its own reading, named and dashed so the three can be told apart', () => {
    const lines = linesOf([STATISTIC_KEYS.AVERAGE, STATISTIC_KEYS.MAXIMUM, STATISTIC_KEYS.PERCENTILE95]);

    expect(lines.map((line) => line.label)).toEqual(['max 56.4', 'p95 54.2', 'avg 42.6']);
    expect(lines.map((line) => line.dash)).toEqual(['2 3', '8 3 2 3', '6 4']);
    expect(lines.map((line) => Math.round(line.y))).toEqual([44, 46, 57]);
  });

  it('pushes a label that would sit on the one above it down, leaving the lines themselves where they are', () => {
    const lines = linesOf([STATISTIC_KEYS.MAXIMUM, STATISTIC_KEYS.PERCENTILE95]);
    const tops = lines.map((line) => Number.parseFloat(line.labelTop));

    expect(tops[1] - (tops[0] ?? 0)).toBeCloseTo(11);
    expect(Math.round(lines[1]?.y ?? 0)).toBe(46);
  });

  it('lifts the whole group when the lowest label would fall off the plot, and never rises above the top', () => {
    const lines = linesOf([STATISTIC_KEYS.MINIMUM, STATISTIC_KEYS.AVERAGE, STATISTIC_KEYS.MAXIMUM], statisticsOf({ minimum: 1, average: 2, maximum: 3 }));
    const tops = lines.map((line) => Number.parseFloat(line.labelTop));

    expect(tops).toEqual([74, 85, 96]);
  });

  it('draws nothing for a window with no readings, and asks for nothing when no statistic is chosen', () => {
    expect(linesOf([STATISTIC_KEYS.AVERAGE], null)).toEqual([]);
    expect(linesOf([])).toEqual([]);
  });

  it('referenceLinesOf a statistic with no finite reading draws no line for it and still draws the others', () => {
    const lines = linesOf([STATISTIC_KEYS.MINIMUM, STATISTIC_KEYS.MAXIMUM], statisticsOf({ minimum: Number.NaN }));

    expect(lines.map((line) => line.key)).toEqual([STATISTIC_KEYS.MAXIMUM]);
  });

  it('keeps a reading beyond the axis inside the plot', () => {
    const [line] = linesOf([STATISTIC_KEYS.MAXIMUM], statisticsOf({ maximum: 400 }));

    expect(line?.y).toBe(0);
  });
});
