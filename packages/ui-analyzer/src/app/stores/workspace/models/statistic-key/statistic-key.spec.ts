import { describe, expect, it } from 'vitest';
import type { SeriesStatistics } from '../series/series.model';
import { isStatisticKey, STATISTIC_KEYS, statisticKeysOf, statisticValueOf, withStatisticToggled } from './statistic-key';

const STATISTICS: SeriesStatistics = { minimum: 1, maximum: 9, average: 5, percentile95: 8, last: 7, gapCount: 0 };

describe('isStatisticKey', () => {
  it('isStatisticKey with the name of a statistic holds, and with any other word does not', () => {
    const known = isStatisticKey('percentile95');
    const unknown = isStatisticKey('median');

    expect(known).toBe(true);
    expect(unknown).toBe(false);
  });
});

describe('statisticKeysOf', () => {
  it('statisticKeysOf stored names keeps the statistics in their order and drops the names that are not one', () => {
    const stored = ['maximum', 'median', 'minimum'];

    const keys = statisticKeysOf(stored);

    expect(keys).toEqual([STATISTIC_KEYS.MAXIMUM, STATISTIC_KEYS.MINIMUM]);
  });
});

describe('statisticValueOf', () => {
  it('statisticValueOf each key reads its own statistic, the current value being the last sample', () => {
    const keys = Object.values(STATISTIC_KEYS);

    const values = keys.map((key) => statisticValueOf(STATISTICS, key));

    expect(values).toEqual([1, 5, 9, 8, 7]);
  });
});

describe('withStatisticToggled', () => {
  it('withStatisticToggled a key that is not shown appends it after the shown ones', () => {
    const shown = [STATISTIC_KEYS.AVERAGE];

    const toggled = withStatisticToggled(shown, STATISTIC_KEYS.MAXIMUM);

    expect(toggled).toEqual([STATISTIC_KEYS.AVERAGE, STATISTIC_KEYS.MAXIMUM]);
  });

  it('withStatisticToggled a key that is shown removes it and keeps the others in order', () => {
    const shown = [STATISTIC_KEYS.MINIMUM, STATISTIC_KEYS.AVERAGE, STATISTIC_KEYS.MAXIMUM];

    const toggled = withStatisticToggled(shown, STATISTIC_KEYS.AVERAGE);

    expect(toggled).toEqual([STATISTIC_KEYS.MINIMUM, STATISTIC_KEYS.MAXIMUM]);
  });
});
