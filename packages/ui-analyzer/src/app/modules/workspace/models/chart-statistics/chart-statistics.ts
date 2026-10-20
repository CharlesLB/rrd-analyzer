import { formatMessage, type StatisticsMessages, type UnitMessages } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { formatCompactValue, unitLabelOf } from '../../../../shared/utils/value-format/value-format.util';
import type { SeriesStatistics } from '../../../../stores/workspace/models/series/series.model';
import { STATISTIC_KEYS, type StatisticKey, statisticValueOf } from '../../../../stores/workspace/models/statistic-key/statistic-key';

export type HeaderStat = {
  readonly key: StatisticKey;
  readonly label: string;
  readonly value: string;
  readonly isCurrent: boolean;
  readonly isActive: boolean;
  readonly lineTip: string;
};

export type HeaderStatistics = {
  readonly cells: readonly HeaderStat[];
  readonly unitLabel: string;
};

export const STATISTIC_KEYS_BY_IMPORTANCE: readonly StatisticKey[] = [
  STATISTIC_KEYS.CURRENT,
  STATISTIC_KEYS.PERCENTILE95,
  STATISTIC_KEYS.MAXIMUM,
  STATISTIC_KEYS.AVERAGE,
  STATISTIC_KEYS.MINIMUM,
];

const cellOf = (
  key: StatisticKey,
  statistics: SeriesStatistics,
  referenceLines: readonly StatisticKey[],
  texts: StatisticsMessages,
  units: UnitMessages,
): HeaderStat => {
  const isActive = referenceLines.includes(key);

  return {
    key,
    label: texts[key],
    value: formatCompactValue(statisticValueOf(statistics, key), units),
    isCurrent: key === STATISTIC_KEYS.CURRENT,
    isActive,
    lineTip: formatMessage(isActive ? texts.hideLine : texts.showLine, { statistic: texts[key] }),
  };
};

const unitWithGapsOf = (statistics: SeriesStatistics | null, unit: string, texts: StatisticsMessages, units: UnitMessages): string => {
  const label = unitLabelOf(unit, units);

  return statistics === null || statistics.gapCount === 0 ? label : formatMessage(texts.unitWithGaps, { unit: label, gaps: statistics.gapCount });
};

export const headerStatisticsOf = (
  statistics: SeriesStatistics | null,
  unit: string,
  referenceLines: readonly StatisticKey[],
  texts: StatisticsMessages,
  units: UnitMessages,
): HeaderStatistics => ({
  cells: statistics === null ? [] : R.map(STATISTIC_KEYS_BY_IMPORTANCE, (key) => cellOf(key, statistics, referenceLines, texts, units)),
  unitLabel: unitWithGapsOf(statistics, unit, texts, units),
});
