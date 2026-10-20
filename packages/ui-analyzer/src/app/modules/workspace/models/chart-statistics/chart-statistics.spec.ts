import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { SeriesStatistics } from '../../../../stores/workspace/models/series/series.model';
import { STATISTIC_KEYS, type StatisticKey } from '../../../../stores/workspace/models/statistic-key/statistic-key';
import { headerStatisticsOf } from './chart-statistics';

const messages = messagesFor();
const PERCENT = '%';

const statisticsOf = (overrides: Partial<SeriesStatistics> = {}): SeriesStatistics => ({
  minimum: 22.4,
  average: 42.6,
  maximum: 56.4,
  percentile95: 54.2,
  last: 35.8,
  gapCount: 0,
  ...overrides,
});

const headerStatistics = (statistics: SeriesStatistics | null, unit = PERCENT, active: readonly StatisticKey[] = []) =>
  headerStatisticsOf(statistics, unit, active, messages.statistics, messages.units);

describe('headerStatisticsOf', () => {
  it('lists the cells most important first, so a header too narrow to hold them all keeps the current reading', () => {
    const { cells } = headerStatistics(statisticsOf());

    expect(cells.map((cell) => cell.label)).toEqual(['now', 'p95', 'max', 'avg', 'min']);
    expect(cells.map((cell) => cell.isCurrent)).toEqual([true, false, false, false, false]);
  });

  it('reads each statistic of the window without its unit, since the row carries the unit once', () => {
    expect(headerStatistics(statisticsOf()).cells.map((cell) => cell.value)).toEqual(['35.8', '54.2', '56.4', '42.6', '22.4']);
    expect(headerStatistics(statisticsOf()).unitLabel).toBe('%');
  });

  it('shortens a large reading and spells out a small one', () => {
    const large = statisticsOf({ minimum: 12_400, average: 5.3e9, maximum: 4.2e6, percentile95: 640, last: 3.145 });

    expect(headerStatistics(large).cells.map((cell) => cell.value)).toEqual(['3.15', '640', '4.2M', '5.3G', '12.4k']);
  });

  it('counts the gaps of the window beside the unit, and calls a unitless series n/a', () => {
    expect(headerStatistics(statisticsOf({ gapCount: 39 }), '').unitLabel).toBe('n/a · 39 gaps');
    expect(headerStatistics(statisticsOf(), '').unitLabel).toBe('n/a');
  });

  it('marks the cells a reference line is drawn for, and names what a click would do to it', () => {
    const { cells } = headerStatistics(statisticsOf(), PERCENT, [STATISTIC_KEYS.AVERAGE]);

    expect(cells.filter((cell) => cell.isActive).map((cell) => cell.label)).toEqual(['avg']);
    expect(cells.map((cell) => cell.lineTip)).toEqual(['show now line', 'show p95 line', 'show max line', 'hide avg line', 'show min line']);
  });

  it('gives a window with no reading no cells at all, so the header can say so in one place', () => {
    expect(headerStatistics(null).cells).toEqual([]);
    expect(headerStatistics(null).unitLabel).toBe('%');
  });
});
