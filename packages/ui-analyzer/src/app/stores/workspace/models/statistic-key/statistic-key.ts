import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import { memberOf } from '../../../../shared/utils/constant-member/constant-member.util';
import type { SeriesStatistics } from '../series/series.model';

export const STATISTIC_KEYS = {
  MINIMUM: 'minimum',
  AVERAGE: 'average',
  MAXIMUM: 'maximum',
  PERCENTILE95: 'percentile95',
  CURRENT: 'current',
} as const;

export type StatisticKey = ValueOf<typeof STATISTIC_KEYS>;

const READING_OF: Readonly<Record<StatisticKey, (statistics: SeriesStatistics) => number>> = {
  [STATISTIC_KEYS.MINIMUM]: (statistics) => statistics.minimum,
  [STATISTIC_KEYS.AVERAGE]: (statistics) => statistics.average,
  [STATISTIC_KEYS.MAXIMUM]: (statistics) => statistics.maximum,
  [STATISTIC_KEYS.PERCENTILE95]: (statistics) => statistics.percentile95,
  [STATISTIC_KEYS.CURRENT]: (statistics) => statistics.last,
};

export const isStatisticKey = (value: string): value is StatisticKey => memberOf(STATISTIC_KEYS, value) !== undefined;

export const statisticValueOf = (statistics: SeriesStatistics, key: StatisticKey): number => READING_OF[key](statistics);

export const statisticKeysOf = (values: readonly string[]): readonly StatisticKey[] => R.filter(values, isStatisticKey);

export const withStatisticToggled = (keys: readonly StatisticKey[], key: StatisticKey): readonly StatisticKey[] =>
  keys.includes(key) ? R.filter(keys, (kept) => kept !== key) : [...keys, key];
